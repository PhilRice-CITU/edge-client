import { useState, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateSession } from '@renderer/hooks/useSession'
import { useGpioButton } from '@renderer/hooks/useGpioButton'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react'

type CaptureState = 'idle' | 'capturing' | 'uploading' | 'done' | 'error'

interface BatchResult {
  captureCount: number
  uploadStatus: 'ok' | 'error'
  errorMessage?: string
}

export function TrainingPage() {
  const navigate = useNavigate()
  const createSession = useCreateSession()
  const sessionIdRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<CaptureState>('idle')
  const [captureCount, setCaptureCount] = useState(0)
  const [uploadCount, setUploadCount] = useState(0)
  const [lastResult, setLastResult] = useState<BatchResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const getFlaskBase = async (): Promise<string> => {
    try {
      return await window.api.getFlaskUrl()
    } catch {
      return 'http://127.0.0.1:5055'
    }
  }

  const handleTrainingCapture = useCallback(async () => {
    if (phase === 'capturing' || phase === 'uploading') return
    setPhase('capturing')
    setErrorMessage(null)
    setLastResult(null)

    try {
      const base = await getFlaskBase()

      // Lazily create a training session on first button press
      let sid = sessionIdRef.current
      if (!sid) {
        const session = await createSession.mutateAsync({
          mode: 'train',
          operator_name: 'training',
          rice_variety: null,
        })
        sid = session.id
        sessionIdRef.current = sid
      }

      // Step 1: Capture IR + white images
      const captureRes = await fetch(`${base}/sessions/${sid}/capture`, { method: 'POST' })
      if (!captureRes.ok) {
        const body = (await captureRes.json().catch(() => ({}))) as {
          error?: string
          detail?: string
        }
        throw new Error(body.detail ?? body.error ?? 'Capture failed')
      }
      const newCount = captureCount + 1
      setCaptureCount(newCount)

      // Step 2: Immediately upload IR + white to Roboflow
      setPhase('uploading')
      const uploadRes = await fetch(`${base}/sessions/${sid}/upload-training`, { method: 'POST' })

      if (!uploadRes.ok) {
        const body = (await uploadRes.json().catch(() => ({}))) as {
          error?: string
          detail?: string
        }
        const msg = body.detail ?? body.error ?? 'Roboflow upload failed'
        setLastResult({ captureCount: newCount, uploadStatus: 'error', errorMessage: msg })
        setErrorMessage(msg)
        setPhase('error')
        return
      }

      setUploadCount((u) => u + 1)
      setLastResult({ captureCount: newCount, uploadStatus: 'ok' })
      setPhase('done')

      // Reset to idle after a brief 'done' flash
      setTimeout(() => setPhase('idle'), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Training capture failed'
      setErrorMessage(msg)
      setPhase('error')
      setTimeout(() => setPhase('idle'), 3000)
    }
  }, [phase, captureCount, createSession])

  useGpioButton('training', handleTrainingCapture)

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
        <div className="w-full rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">GPIO Button Active</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Press the physical button to capture and upload training images to Roboflow.
          </p>

          {/* Phase indicator */}
          <div className="mt-5 flex items-center justify-center gap-3 min-h-[28px]">
            {phase === 'capturing' && (
              <>
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Capturing…</span>
              </>
            )}
            {phase === 'uploading' && (
              <>
                <UploadCloud size={18} className="animate-pulse text-primary" />
                <span className="text-sm text-primary">Uploading to Roboflow…</span>
              </>
            )}
            {phase === 'done' && (
              <>
                <CheckCircle2 size={18} className="text-green-500" />
                <span className="text-sm text-green-500">Uploaded successfully</span>
              </>
            )}
            {phase === 'error' && (
              <span className="text-sm text-destructive">{errorMessage}</span>
            )}
          </div>

          {/* Stats */}
          <div className="mt-4 flex justify-center gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{captureCount}</p>
              <p className="text-xs text-muted-foreground">Captured</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{uploadCount}</p>
              <p className="text-xs text-muted-foreground">Uploaded</p>
            </div>
            {lastResult && captureCount !== uploadCount && (
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">
                  {captureCount - uploadCount}
                </p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <KioskButton onClick={() => navigate({ to: '/home' })} variant="secondary">
        Done
      </KioskButton>
    </div>
  )
}
