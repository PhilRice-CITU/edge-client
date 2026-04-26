import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { useCreateSession } from '@renderer/hooks/useSession'
import { StatusBadge } from '@renderer/components/molecules/StatusBadge'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { AnimatedLogo } from '@renderer/components/atoms/AnimatedLogo'

export function HomePage() {
  const navigate = useNavigate()
  const { data: status } = useDeviceStatus()
  const createSession = useCreateSession()
  const [creating, setCreating] = useState(false)
  const [apiError, setApiError] = useState(false)
  const isProduction = import.meta.env.VITE_EDGE_MODE === 'production'

  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    const offAvailable = window.api.onUpdateAvailable((v) => setUpdateVersion(v))
    const offDownloaded = window.api.onUpdateDownloaded((v) => {
      setUpdateVersion(v)
      setUpdateReady(true)
    })
    return () => {
      offAvailable()
      offDownloaded()
    }
  }, [])

  const handleGradeMode = async () => {
    if (creating) return
    setCreating(true)
    setApiError(false)
    try {
      const session = await createSession.mutateAsync({
        mode: 'grade',
        operator_name: '',
        rice_variety: null,
      })
      navigate({ to: '/session/$sessionId', params: { sessionId: session.id } })
    } catch {
      setApiError(true)
    } finally {
      setCreating(false)
    }
  }

  const handleTrainMode = () => {
    navigate({ to: '/training' })
  }

  return (
    <div className="flex h-full flex-col items-center justify-between p-8">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <AnimatedLogo size={28} animate={false} />
          <h1 className="text-xl font-semibold text-foreground">Hum.ai</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <button
            onClick={() => navigate({ to: '/settings' })}
            aria-label="Settings"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-4xl font-bold text-foreground">Select Mode</h2>
        <p className="text-muted-foreground">Choose how to use this device</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        {updateVersion && (
          <div className="rounded-xl bg-primary/10 px-4 py-3 text-center text-sm text-primary">
            {updateReady
              ? `v${updateVersion} ready — restarts on next quit`
              : `v${updateVersion} downloading…`}
            {updateReady && (
              <button
                onClick={() => window.api.installUpdate()}
                className="ml-2 underline underline-offset-2"
              >
                Restart now
              </button>
            )}
          </div>
        )}
        {apiError && (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            Cannot reach the server. Check your connection and API_BASE_URL in settings.
          </p>
        )}
        <KioskButton onClick={handleGradeMode} disabled={creating} variant="primary">
          {creating ? 'Starting…' : 'Grade Rice'}
        </KioskButton>
        {!isProduction && (
          <KioskButton onClick={handleTrainMode} variant="secondary">
            Training Mode
          </KioskButton>
        )}
      </div>
    </div>
  )
}
