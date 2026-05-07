import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { Moon, Sun, Cpu, Wifi, ArrowLeft, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '@renderer/hooks/useTheme'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { cn } from '@renderer/lib/utils'

interface ConfigFields {
  API_BASE_URL: string
  MQTT_HOST: string
  MQTT_PORT: string
  EDGE_MODE: string
  ROBOFLOW_API_KEY: string
  ROBOFLOW_WORKSPACE: string
  ROBOFLOW_PROJECT_NORMAL: string
  ROBOFLOW_PROJECT_IR: string
}

const DEFAULT_CONFIG: ConfigFields = {
  API_BASE_URL: '',
  MQTT_HOST: '',
  MQTT_PORT: '1883',
  EDGE_MODE: 'production',
  ROBOFLOW_API_KEY: '',
  ROBOFLOW_WORKSPACE: '',
  ROBOFLOW_PROJECT_NORMAL: '',
  ROBOFLOW_PROJECT_IR: '',
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { data: status } = useDeviceStatus()

  const [config, setConfig] = useState<ConfigFields>(DEFAULT_CONFIG)
  const [configExpanded, setConfigExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null)

  // Load current config on mount
  useEffect(() => {
    window.api.getConfig().then((cfg) => {
      setConfig((prev) => ({ ...prev, ...cfg }))
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveResult(null)
    const result = await window.api.saveConfig(config as unknown as Record<string, string>)
    setSaving(false)
    setSaveResult(result.ok ? 'ok' : 'error')
    setTimeout(() => setSaveResult(null), 3000)
  }

  const handleFieldChange = (key: keyof ConfigFields, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex w-full p-12 items-center gap-3">
        <button
          onClick={() => navigate({ to: '/home' })}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex w-full px-24 flex-col gap-5">
        {/* Appearance */}
        <section className="flex flex-col gap-2">
          <h2 className="pb-1 border-b border-border/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </h2>

          <button
            onClick={toggleTheme}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3 text-foreground">
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              <span className="text-sm font-medium">
                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
              </span>
            </div>
            <div
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors duration-200',
                theme === 'dark' ? 'bg-primary' : 'bg-muted',
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                  theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </div>
          </button>
        </section>

        {/* Device info */}
        <section className="flex flex-col gap-2">
          <h2 className="pb-1 border-b border-border/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Device
          </h2>

          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-card">
            <InfoRow
              icon={<Cpu size={16} />}
              label="Name"
              value={status?.display_name || status?.device_id || '—'}
            />
            <InfoRow label="Device ID" value={status?.device_id ?? '—'} />
            <InfoRow
              icon={<Wifi size={16} />}
              label="Mode"
              value={
                status?.edge_mode
                  ? status.edge_mode.charAt(0).toUpperCase() + status.edge_mode.slice(1)
                  : '—'
              }
            />
            <InfoRow label="Images on disk" value={status ? String(status.images_on_disk) : '—'} />
          </div>
        </section>

        {/* Device Identity / QR Code */}
        {status?.qr_url && (
          <section className="flex flex-col gap-2">
            <h2 className="pb-1 border-b border-border/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Device Identity
            </h2>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
              {status.display_name && (
                <p className="text-sm font-semibold text-foreground">{status.display_name}</p>
              )}
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <QRCodeSVG value={status.qr_url} size={140} />
              </div>
              <p className="text-xs text-muted-foreground">Scan to view in web dashboard</p>
            </div>
          </section>
        )}

        {/* Configuration */}
        <section className="flex flex-col gap-2">
          <button
            onClick={() => setConfigExpanded((v) => !v)}
            className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>Configuration</span>
            {configExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {configExpanded && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <ConfigField
                label="API Base URL"
                value={config.API_BASE_URL}
                placeholder="https://your-api-server.com"
                onChange={(v) => handleFieldChange('API_BASE_URL', v)}
              />
              <ConfigField
                label="MQTT Host"
                value={config.MQTT_HOST}
                placeholder="broker.hivemq.com"
                onChange={(v) => handleFieldChange('MQTT_HOST', v)}
              />
              <ConfigField
                label="MQTT Port"
                value={config.MQTT_PORT}
                placeholder="1883"
                onChange={(v) => handleFieldChange('MQTT_PORT', v)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Edge Mode</label>
                <select
                  value={config.EDGE_MODE}
                  onChange={(e) => handleFieldChange('EDGE_MODE', e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="production">Production</option>
                  <option value="training">Training</option>
                </select>
              </div>
              <ConfigField
                label="Roboflow API Key"
                value={config.ROBOFLOW_API_KEY}
                placeholder="rf_xxxxxxxxxxxx"
                type="password"
                onChange={(v) => handleFieldChange('ROBOFLOW_API_KEY', v)}
              />
              <ConfigField
                label="Roboflow Workspace"
                value={config.ROBOFLOW_WORKSPACE}
                placeholder="my-workspace"
                onChange={(v) => handleFieldChange('ROBOFLOW_WORKSPACE', v)}
              />
              <ConfigField
                label="Roboflow Normal Project"
                value={config.ROBOFLOW_PROJECT_NORMAL}
                placeholder="rice-grading-normal"
                onChange={(v) => handleFieldChange('ROBOFLOW_PROJECT_NORMAL', v)}
              />
              <ConfigField
                label="Roboflow IR Project"
                value={config.ROBOFLOW_PROJECT_IR}
                placeholder="rice-grading-ir"
                onChange={(v) => handleFieldChange('ROBOFLOW_PROJECT_IR', v)}
              />

              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  'mt-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors',
                  saving
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <Save size={15} />
                {saving ? 'Saving…' : 'Save Configuration'}
              </button>

              {saveResult === 'ok' && (
                <p className="text-center text-xs text-green-500">
                  Saved — restart the app for changes to take effect
                </p>
              )}
              {saveResult === 'error' && (
                <p className="text-center text-xs text-destructive">
                  Save failed — check app permissions
                </p>
              )}
            </div>
          )}
        </section>

        {/* About */}
        <section className="flex flex-col gap-2">
          <h2 className="pb-1 border-b border-border/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            About
          </h2>
          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-card">
            <InfoRow label="App" value="Hum.ai — Rice Vision" />
            <InfoRow label="Standard" value="PNS/BAFS 290:2025" />
          </div>
        </section>
      </div>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm [&+&]:border-t [&+&]:border-border">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function ConfigField({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  type?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}
