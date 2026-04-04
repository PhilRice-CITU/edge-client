interface UploadProgressProps {
  batchCount: number
}

export function UploadProgress({ batchCount }: UploadProgressProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Submitting for Grading</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Uploading {batchCount} batch{batchCount !== 1 ? 'es' : ''}…
        </p>
      </div>
    </div>
  )
}
