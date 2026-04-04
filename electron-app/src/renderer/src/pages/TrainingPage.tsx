import { useNavigate } from '@tanstack/react-router'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { KioskButton } from '@renderer/components/molecules/KioskButton'

export function TrainingPage() {
  const navigate = useNavigate()
  const { data: status } = useDeviceStatus()

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: '/home' })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Training Mode</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">GPIO Button Active</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Press the physical button to capture training images. They will be automatically
            uploaded to Roboflow.
          </p>
          {status && (
            <p className="mt-3 text-xs text-muted-foreground">
              {status.queued_uploads} image{status.queued_uploads !== 1 ? 's' : ''} queued for
              upload
            </p>
          )}
        </div>
      </div>

      <KioskButton onClick={() => navigate({ to: '/home' })} variant="secondary">
        Done
      </KioskButton>
    </div>
  )
}
