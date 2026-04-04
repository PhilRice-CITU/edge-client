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

export function SessionPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId' })
  const navigate = useNavigate()
  const { data: session, isLoading } = useSession(sessionId)
  const capture = useCapture(sessionId)
  const updateSession = useUpdateSession(sessionId)
  const submitSession = useSubmitSession(sessionId)
  const [submitting, setSubmitting] = useState(false)
  const [operatorName, setOperatorName] = useState('')

  const handleCapture = () => capture.mutate()

  const handleSubmit = async () => {
    if (submitting || !session?.batches.length) return
    setSubmitting(true)
    await updateSession.mutateAsync({ operator_name: operatorName })
    try {
      await submitSession.mutateAsync()
      navigate({ to: '/session/$sessionId/result', params: { sessionId } })
    } catch {
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
    return <UploadProgress batchCount={session?.batches.length ?? 0} />
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: '/home' })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {session?.batches.length ?? 0} batch
          {(session?.batches.length ?? 0) !== 1 ? 'es' : ''} captured
        </span>
      </div>

      <CameraPreview isCapturing={capture.isPending} className="h-40 flex-shrink-0" />

      <BatchGallery batches={session?.batches ?? []} />

      <div className="flex flex-col gap-3">
        <BatchNameInput
          value={operatorName}
          onChange={setOperatorName}
          placeholder="Operator name (optional)"
        />
        <CaptureButton onCapture={handleCapture} isCapturing={capture.isPending} />
        <KioskButton
          onClick={handleSubmit}
          disabled={!session?.batches.length || submitting}
          variant="primary"
        >
          Submit for Grading →
        </KioskButton>
      </div>
    </div>
  )
}
