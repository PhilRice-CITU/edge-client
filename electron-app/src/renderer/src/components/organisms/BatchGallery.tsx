import type { Batch } from '@renderer/types/session'
import { BatchCard } from '@renderer/components/molecules/BatchCard'

interface BatchGalleryProps {
  batches: Batch[]
}

export function BatchGallery({ batches }: BatchGalleryProps) {
  if (batches.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
        <p className="text-sm">No batches yet</p>
        <p className="mt-1 text-xs">Press Capture to start</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        {batches.map((batch) => (
          <BatchCard key={batch.batch_number} batch={batch} />
        ))}
      </div>
    </div>
  )
}
