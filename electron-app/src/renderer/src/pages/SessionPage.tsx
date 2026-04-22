import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useSession, useUpdateSession, useSubmitSession } from '@renderer/hooks/useSession'
import { useCapture } from '@renderer/hooks/useCapture'
import { BatchGallery } from '@renderer/components/organisms/BatchGallery'
import { CameraPreview } from '@renderer/components/organisms/CameraPreview'
import { CaptureButton } from '@renderer/components/molecules/CaptureButton'
import { BatchNameInput } from '@renderer/components/molecules/BatchNameInput'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { UploadProgress } from '@renderer/components/organisms/UploadProgress'
import type { UploadStep } from '@renderer/components/organisms/UploadProgress'

export function SessionPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId' })
  const navigate = useNavigate()
  const { data: session, isLoading } = useSession(sessionId)
  const capture = useCapture(sessionId)
  const updateSession = useUpdateSession(sessionId)
  const submitSession = useSubmitSession(sessionId)

  const [submitting, setSubmitting] = useState(false)
  const [uploadStep, setUploadStep] = useState<UploadStep>('saving')
  const [operatorName, setOperatorName] = useState('')
  const [riceVariety, setRiceVariety] = useState('')
  const [uploadSent, setUploadSent] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleCapture = () => {
    setCaptureError(null)
    setSubmitError(null)
    capture.mutate(undefined, {
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Capture failed. Please try again.'
        setCaptureError(message)
      },
    })
  }

  const handleSubmit = async () => {
    if (submitting || !session?.batches.length) return
    setSubmitting(true)
    setSubmitError(null)
    setUploadSent(false)
    setUploadStep('saving')

    try {
      await updateSession.mutateAsync({
        operator_name: operatorName,
        rice_variety: riceVariety.trim() || null,
      })
    } catch {
      setSubmitError('Failed to save session details. Please try again.')
      setSubmitting(false)
      return
    }

    setUploadStep('uploading')
    try {
      await submitSession.mutateAsync()
      setSubmitting(false)
      setUploadSent(true)
    } catch {
      setSubmitError('Upload failed. Check your connection and try again.')
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
    return <UploadProgress batchCount={session?.batches.length ?? 0} step={uploadStep} />
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

  const batchCount = session?.batches.length ?? 0

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: '/home' })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {batchCount} batch{batchCount !== 1 ? 'es' : ''} captured
        </span>
      </div>

      <CameraPreview isCapturing={capture.isPending} className="h-48 shrink-0" />

      <BatchGallery batches={session?.batches ?? []} />

      <div className="flex flex-col gap-2">
        <BatchNameInput
          value={operatorName}
          onChange={setOperatorName}
          placeholder="Operator name (optional)"
        />
        <BatchNameInput
          value={riceVariety}
          onChange={setRiceVariety}
          placeholder="Rice variety (optional)"
        />
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
  )
}
