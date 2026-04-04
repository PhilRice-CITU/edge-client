import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { useCreateSession } from '@renderer/hooks/useSession'
import { StatusBadge } from '@renderer/components/molecules/StatusBadge'
import { KioskButton } from '@renderer/components/molecules/KioskButton'

export function HomePage() {
  const navigate = useNavigate()
  const { data: status } = useDeviceStatus()
  const createSession = useCreateSession()
  const [creating, setCreating] = useState(false)
  const [flaskError, setFlaskError] = useState(false)

  const handleGradeMode = async () => {
    if (creating) return
    setCreating(true)
    setFlaskError(false)
    try {
      const session = await createSession.mutateAsync({
        mode: 'grade',
        operator_name: '',
        rice_variety: null,
      })
      navigate({ to: '/session/$sessionId', params: { sessionId: session.id } })
    } catch {
      setFlaskError(true)
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
        <h1 className="text-xl font-semibold text-foreground">Hum.ai</h1>
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
        {flaskError && (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            Cannot reach device service. Make sure Flask is running (startup.sh).
          </p>
        )}
        <KioskButton onClick={handleGradeMode} disabled={creating} variant="primary">
          {creating ? 'Starting…' : 'Grade Rice'}
        </KioskButton>
        <KioskButton onClick={handleTrainMode} variant="secondary">
          Training Mode
        </KioskButton>
      </div>
    </div>
  )
}
