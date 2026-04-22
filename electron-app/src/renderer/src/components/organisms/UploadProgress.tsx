export type UploadStep = 'saving' | 'uploading'

interface UploadProgressProps {
  batchCount: number
  step: UploadStep
}

const STEP_LABELS: Record<UploadStep, string> = {
  saving: 'Saving session details…',
  uploading: 'Uploading batches…',
}

export function UploadProgress({ batchCount, step }: UploadProgressProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Submitting for Grading</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 'uploading'
            ? `Uploading ${batchCount} batch${batchCount !== 1 ? 'es' : ''}…`
            : STEP_LABELS[step]}
        </p>
      </div>
      <div className="flex gap-2">
        {(['saving', 'uploading'] as UploadStep[]).map((s) => (
          <div
            key={s}
            className={`h-1.5 w-8 rounded-full transition-colors ${
              s === step ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
