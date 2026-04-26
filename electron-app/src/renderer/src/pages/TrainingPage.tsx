import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useGpioButton } from '@renderer/hooks/useGpioButton'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { CameraPreview } from '@renderer/components/molecules/CameraPreview'
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react'
import { apiUrl, edgeHeaders, getDeviceId } from '@renderer/lib/api'

type CaptureState = 'idle' | 'capturing' | 'uploading' | 'done' | 'error'

interface BatchResult {
  captureCount: number
  uploadStatus: 'ok' | 'error'
  errorMessage?: string
}

export function TrainingPage() {
  const navigate = useNavigate()

  const [phase, setPhase] = useState<CaptureState>('idle')
  const [captureCount, setCaptureCount] = useState(0)
  const [uploadCount, setUploadCount] = useState(0)
  const [lastResult, setLastResult] = useState<BatchResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleTrainingCapture = useCallback(async () => {
    if (phase === 'capturing' || phase === 'uploading') return
    setPhase('capturing')
    setErrorMessage(null)
    setLastResult(null)

    const newCount = captureCount + 1
    setCaptureCount(newCount)

    try {
      // Step 1: hardware capture via IPC
      const { ir_path, white_path } = await window.api.runCapture()

      setPhase('uploading')

      // Step 2: upload to Roboflow via cloud edge endpoint, then delete from disk
      let uploadOk = false
      try {
        const form = new FormData()
        const [irResp, whiteResp] = await Promise.all([
          fetch(`local-image://${ir_path}`),
          fetch(`local-image://${white_path}`),
        ])
        if (!irResp.ok || !whiteResp.ok) throw new Error('Could not read captured images from disk')
        form.append('ir', await irResp.blob(), 'ir.jpg')
        form.append('raw', await whiteResp.blob(), 'raw.jpg')

        const deviceId = getDeviceId()
        if (!deviceId) {
          throw new Error('Device not provisioned — go to Setup to register this device')
        }
        const res = await fetch(apiUrl(`/devices/${deviceId}/upload-training`), {
          method: 'POST',
          headers: edgeHeaders(),
          body: form,
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
          throw new Error(body.detail ?? body.error ?? 'Upload failed')
        }

        uploadOk = true
      } finally {
        // Training images are never needed after the upload attempt — always clean up
        await window.api.deleteFiles([ir_path, white_path])
      }

      if (uploadOk) {
        setUploadCount((u) => u + 1)
        setLastResult({ captureCount: newCount, uploadStatus: 'ok' })
        setPhase('done')
        setTimeout(() => setPhase('idle'), 1500)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Training capture failed'
      setLastResult({ captureCount: newCount, uploadStatus: 'error', errorMessage: msg })
      setErrorMessage(msg)
      setPhase('error')
      setTimeout(() => setPhase('idle'), 3000)
    }
  }, [phase, captureCount])

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
        <div className="w-full max-w-sm">
          <CameraPreview
            paused={phase === 'capturing'}
            overlayLabel={phase === 'capturing' ? 'Capturing…' : null}
          />
        </div>

        <div className="w-full rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">GPIO Button Active</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Press the physical button to capture and upload training images to Roboflow.
          </p>

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
                <span className="text-sm text-primary">Uploading…</span>
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
