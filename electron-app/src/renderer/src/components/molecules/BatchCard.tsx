import type { Batch } from '@renderer/types/session'

interface BatchCardProps {
  batch: Batch
}

export function BatchCard({ batch }: BatchCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-center">
      <div className="flex gap-1">
        <div className="flex-1 rounded-lg bg-muted/50 py-6 text-xs text-muted-foreground">
          IR
        </div>
        <div className="flex-1 rounded-lg bg-muted/50 py-6 text-xs text-muted-foreground">
          LED
        </div>
      </div>
      <span className="text-xs font-medium text-foreground">Batch {batch.batch_number}</span>
    </div>
  )
}
