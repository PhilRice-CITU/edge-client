import { useState, useCallback } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useSession, useSubmitSession } from '@renderer/hooks/useSession'
import { useCapture } from '@renderer/hooks/useCapture'
import { useGpioButton } from '@renderer/hooks/useGpioButton'
import { BatchGallery } from '@renderer/components/organisms/BatchGallery'
import { CameraPreview } from '@renderer/components/molecules/CameraPreview'
import { CaptureButton } from '@renderer/components/molecules/CaptureButton'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { UploadProgress } from '@renderer/components/organisms/UploadProgress'
import type { UploadStep } from '@renderer/components/organisms/UploadProgress'

export function SessionPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId' })
  const navigate = useNavigate()

  const [submitting, setSubmitting] = useState(false)
  const [uploadStep, setUploadStep] = useState<UploadStep>('saving')
  const [uploadSent, setUploadSent] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: session, isLoading } = useSession(sessionId, false)
  const batchCount = session?.batches.length ?? 0

  const capture = useCapture(sessionId, batchCount)
  const submitSession = useSubmitSession(sessionId, session?.batches ?? [])

  const handleCapture = useCallback(() => {
    if (capture.isPending) return
    setCaptureError(null)
    setSubmitError(null)
    capture.mutate(undefined, {
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Capture failed. Please try again.'
        setCaptureError(message)
      },
    })
  }, [capture])

  useGpioButton('session', handleCapture)

  const handleSubmit = async () => {
    if (submitting || !batchCount) return
    setSubmitting(true)
    setSubmitError(null)
    setUploadSent(false)
    setUploadStep('saving')

    setUploadStep('uploading')
    try {
      await submitSession.mutateAsync()
      setSubmitting(false)
      setUploadSent(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSubmitError(`Upload failed: ${msg}`)
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (submitting) {
    return <UploadProgress batchCount={batchCount} step={uploadStep} />
  }

  if (uploadSent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-semibold text-foreground">Upload Sent</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Session data was uploaded successfully. Please check the dashboard for grading results.
          </p>
        </div>
        <KioskButton onClick={() => navigate({ to: '/home' })} variant="primary">
          Back to Home
        </KioskButton>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Scrollable content ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 pb-3">
        <div className="flex items-center justify-between py-2">
          <button
            onClick={() => navigate({ to: '/home' })}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <div className="flex flex-col items-end">
            {session?.session_name && (
              <span className="text-base font-semibold text-foreground">{session.session_name}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {batchCount} batch{batchCount !== 1 ? 'es' : ''} captured
            </span>
          </div>
        </div>

        <div className="mt-4">
          <CameraPreview
            paused={capture.isPending}
            overlayLabel={capture.isPending ? 'Capturing…' : null}
          />
        </div>

        <div className="mt-4">
          <BatchGallery batches={session?.batches ?? []} />
        </div>
      </div>

      {/* ── Sticky bottom actions ────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-background px-5 py-3">
        <div className="flex flex-col gap-2">
          <CaptureButton onCapture={handleCapture} isCapturing={capture.isPending} />
          {captureError && (
            <p className="rounded-xl bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
              {captureError}
            </p>
          )}
          {submitError && (
            <p className="rounded-xl bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
              {submitError}
            </p>
          )}
          <KioskButton
            onClick={handleSubmit}
            disabled={!batchCount || submitting}
            variant="primary"
          >
            Submit for Grading →
          </KioskButton>
        </div>
      </div>
    </div>
  )
}
