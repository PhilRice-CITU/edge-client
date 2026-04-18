# Plan: App Icon + Auto-Pull on Boot

## Context

The Rice Vision edge client runs on Raspberry Pi via a systemd service (`rice-vision.service`) that calls `startup.sh`. Currently:
- The app uses a generic Electron icon (no branding)
- Updates require manually SSH-ing in, doing `git pull`, rebuilding, and running `sudo systemctl restart rice-vision`
- The goal is: (1) brand the app with the existing `logo-icon.svg`, and (2) make every boot automatically pull latest code and rebuild so the Pi is always up to date

---

## Iteration 1 — App Icon

### What needs to happen
The SVG at `web-dashboard/public/logo-icon.svg` (already present at `edge-client/electron-app/src/renderer/src/assets/logo-icon.svg`) needs to be converted into three icon files that electron-builder picks up automatically from `electron-app/build/`:
- `icon.png` — 512×512 (Linux, used by Electron at runtime and in taskbar)
- `icon.icns` — macOS bundle icon (multi-resolution)
- `icon.ico` — Windows icon

The files already exist as placeholders — we replace them.

### Steps

**Step 1 — Convert SVG → PNG on dev machine (Mac)**
Use `rsvg-convert` (via `brew install librsvg`) or the Python `cairosvg` library:
```bash
# Option A: rsvg-convert
rsvg-convert -w 512 -h 512 \
  edge-client/electron-app/src/renderer/src/assets/logo-icon.svg \
  -o edge-client/electron-app/build/icon.png

# Option B: Python cairosvg (if rsvg not available)
python3 -c "import cairosvg; cairosvg.svg2png(url='web-dashboard/public/logo-icon.svg', write_to='edge-client/electron-app/build/icon.png', output_width=512, output_height=512)"
```

**Step 2 — Generate icon.icns (macOS)**
```bash
mkdir -p /tmp/rice-icon.iconset
for size in 16 32 64 128 256 512; do
  rsvg-convert -w $size -h $size \
    web-dashboard/public/logo-icon.svg \
    -o /tmp/rice-icon.iconset/icon_${size}x${size}.png
done
iconutil -c icns /tmp/rice-icon.iconset -o edge-client/electron-app/build/icon.icns
```

**Step 3 — Generate icon.ico (Windows)**
```bash
# Using ImageMagick
convert edge-client/electron-app/build/icon.png \
  -resize 256x256 edge-client/electron-app/build/icon.ico
```

**Step 4 — Update electron-builder.yml**
Update `productName` and `appId` from generic defaults:
- `appId`: `com.ricevision.edge`
- `productName`: `Rice Vision`

File: `edge-client/electron-app/electron-builder.yml`

**Step 5 — Update package.json**
- `name`: `rice-vision`
- `description`: `Rice Vision Edge Client`
- `author`: your name/org

File: `edge-client/electron-app/package.json`

### Verification
- Run `npm run build:linux` — check `out/` folder for the built app
- Icon should appear in the Electron window title bar and taskbar on Pi

---

## Iteration 2 — Auto-Pull on Boot

### What needs to happen
Add a `git pull` + rebuild step at the top of `startup.sh`, before any services start. This replaces the manual `git pull → rebuild → restart` workflow.

### Design decisions
- **Always rebuild Electron** after pull — adds ~2min to boot but guarantees fresh UI
- **Don't fail the boot if pull fails** (no internet = log warning and continue with current code)
- **Python deps**: re-run `pip install -r requirements.txt` if `requirements.txt` changed
- **npm deps**: re-run `npm ci` if `package-lock.json` changed (already partially handled, but make it diff-aware)

### Changes to startup.sh

Add a new `log_section "Auto-update"` block near the top, right after the environment section and before provisioning (around line 34):

```bash
log_section "Auto-update"
REPO_ROOT="$SCRIPT_DIR"

if git -C "$REPO_ROOT" pull --ff-only origin main 2>&1 | tee -a "$LOG_FILE"; then
    log_ok "git pull succeeded"

    # Always rebuild Electron after pull
    log_info "Rebuilding Electron app after update..."
    rm -rf "$SCRIPT_DIR/electron-app/out"   # force full rebuild

    # Reinstall npm deps if package-lock changed
    if git -C "$REPO_ROOT" diff HEAD@{1} --name-only 2>/dev/null \
        | grep -q "electron-app/package-lock.json"; then
        log_info "package-lock.json changed — reinstalling npm deps"
        rm -rf "$SCRIPT_DIR/electron-app/node_modules"
    fi

    # Reinstall Python deps if requirements changed
    if git -C "$REPO_ROOT" diff HEAD@{1} --name-only 2>/dev/null \
        | grep -q "requirements.txt"; then
        log_info "requirements.txt changed — reinstalling Python deps"
        pip install -q -r "$REPO_ROOT/requirements.txt" --break-system-packages \
            || log_warn "pip install failed — continuing with existing deps"
    fi
else
    log_warn "git pull failed (no internet or conflict) — starting with current code"
fi
```

The existing Electron build check (lines 66–83 of startup.sh) already handles `npm ci` + `npm run build:linux` when `out/` is missing — deleting `out/` above triggers it naturally.

### Edge cases handled

| Scenario | Behavior |
|---|---|
| No internet on boot | `git pull` fails gracefully, logs warning, boots normally |
| Already up to date | `git pull` is a no-op, `out/` not deleted, boot is fast |
| Python deps changed | pip reinstall triggered |
| npm deps changed | `node_modules` wiped, `npm ci` re-runs (existing logic) |
| Electron src changed | `out/` wiped, full rebuild runs (existing logic) |
| First boot ever | `out/` doesn't exist anyway, existing logic handles it |

---

## Iteration 3 — .desktop File for Pi Desktop (Optional)

If the Pi runs a desktop environment (LXDE/Openbox), add a `.desktop` launcher so users can see the Rice Vision icon and click to launch.

File to create: `/home/<user>/.local/share/applications/rice-vision.desktop`

```ini
[Desktop Entry]
Type=Application
Name=Rice Vision
Comment=Rice grain quality grading system
Exec=/home/humai/edge-client/startup.sh
Icon=/home/humai/edge-client/electron-app/build/icon.png
Terminal=false
Categories=Science;
```

This can be installed automatically by `setup.sh`.

---

## Critical Files

| File | Change |
|---|---|
| `electron-app/build/icon.png` | Replace with SVG-derived 512×512 PNG |
| `electron-app/build/icon.icns` | Replace with SVG-derived macOS icon |
| `electron-app/build/icon.ico` | Replace with SVG-derived Windows icon |
| `electron-app/electron-builder.yml` | Update `appId` to `com.ricevision.edge`, `productName` to `Rice Vision` |
| `electron-app/package.json` | Update `name`, `description` |
| `startup.sh` | Add auto-update block after line 32 (after `apply_defaults`) |

---

## Verification

1. **Icon:** `npm run build:linux` → launch app → confirm icon in title bar
2. **Auto-pull:** Make a dummy commit to `main`, reboot Pi, check `journalctl -u rice-vision -f` — should show "git pull succeeded" and rebuild logs
3. **No-internet boot:** Disconnect Pi from network, reboot → should log warning and boot normally within ~30s
4. **Fast boot (already up to date):** Second reboot after pull → `out/` exists → skips rebuild → boots quickly
