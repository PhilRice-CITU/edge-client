# IR Capture Tuning Recommendations

## Why this is happening
Your current IR capture settings are bright and can clip grain highlights:
- IR EV: -2
- IR gain: 4
- IR shutter: 10000 us

That combination can still overexpose under strong IR illumination. The blown highlights also make grain edges look soft.

## Recommended starting values
Use these as your first pass.

### IR (primary fix)
- IR autofocus settle sleep: 7.0 seconds
- IR capture timeout (-t): 6500 ms
- IR EV: -3.0
- IR gain: 2.0
- IR shutter: 4500 us

### White (keep balanced)
- White autofocus settle sleep: 5.5 seconds
- White capture timeout (-t): 6000 ms
- White EV: -1.4
- White gain: 3.0
- White shutter: 5000 us

### Shared
- Relay settle sleep: 0.6 seconds
- Resolution: 1024 x 1024 (keep for now)

## Suggested capture.sh changes
In scripts/capture.sh, update the IR capture section from:

rpicam-still -o "$IR_PATH" -t 5000 --ev -2 --gain 4 --shutter 10000 --width 1024 --height 1024

To:

rpicam-still -o "$IR_PATH" -t 6500 --ev -3.0 --gain 2.0 --shutter 4500 --width 1024 --height 1024

And increase the IR autofocus settle sleep before that command from 5 to 7.

Update white capture from:

rpicam-still -o "$WHITE_PATH" -t 6000 --ev -1.3 --gain 4 --shutter 6000 --width 1024 --height 1024

To:

rpicam-still -o "$WHITE_PATH" -t 6000 --ev -1.4 --gain 3.0 --shutter 5000 --width 1024 --height 1024

And set white autofocus settle sleep to 5.5.

## Quick tuning ladder after first test
If IR is still too bright:
1. Lower IR gain from 2.0 to 1.6.
2. Then lower IR shutter from 4500 to 3500.
3. Then lower IR EV from -3.0 to -3.3.

If IR becomes too dark:
1. Raise IR gain from 2.0 to 2.4.
2. Then raise IR shutter from 4500 to 5500.

If focus is still soft:
1. Increase IR autofocus settle from 7.0 to 8.0.
2. Increase IR capture timeout from 6500 to 7500.

## Acceptance check
Use one fixed sample tray and capture 3 times.
- Grain edges should be clear on most grains.
- Highlights should not appear as flat white blobs.
- Brightness should be consistent across all 3 shots.
