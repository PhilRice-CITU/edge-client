import { useNavigate } from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { Moon, Sun, Cpu, Wifi, ArrowLeft } from 'lucide-react'
import { useTheme } from '@renderer/hooks/useTheme'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { cn } from '@renderer/lib/utils'

export function SettingsPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { data: status } = useDeviceStatus()

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: '/home' })}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      {/* Settings list */}
      <div className="flex flex-col gap-3">
        {/* Appearance */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
            {/* Toggle pill */}
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Device
          </h2>

          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-card">
            <InfoRow
              icon={<Cpu size={16} />}
              label="Name"
              value={status?.display_name || status?.device_id || '—'}
            />
            <InfoRow
              label="Device ID"
              value={status?.device_id ?? '—'}
            />
            <InfoRow
              icon={<Wifi size={16} />}
              label="Mode"
              value={
                status
                  ? status.edge_mode.charAt(0).toUpperCase() + status.edge_mode.slice(1)
                  : '—'
              }
            />
            <InfoRow
              label="Images on disk"
              value={status ? String(status.images_on_disk) : '—'}
            />
            <InfoRow
              label="Queued uploads"
              value={status ? String(status.queued_uploads) : '—'}
            />
          </div>
        </section>

        {/* Device Identity / QR Code */}
        {status?.qr_url && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

        {/* App info */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            About
          </h2>
          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-card">
            <InfoRow label="App" value="Rice Vision" />
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
