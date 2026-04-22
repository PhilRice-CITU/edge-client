import { useState } from 'react'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import type { Batch } from '@renderer/types/session'

interface BatchCardProps {
  batch: Batch
}

function BatchImage({ path, label }: { path: string; label: string }) {
  const [failed, setFailed] = useState(false)
  const src = `${FLASK_BASE_URL}/preview/image?path=${encodeURIComponent(path)}`

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg bg-muted/50 py-6 text-xs text-muted-foreground">
        {label}
      </div>
    )
  }

  return (
    <div className="relative flex-1 overflow-hidden rounded-lg bg-muted/50">
      <img
        src={src}
        alt={label}
        className="h-16 w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white">
        {label}
      </span>
    </div>
  )
}

export function BatchCard({ batch }: BatchCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-center">
      <div className="flex gap-1">
        <BatchImage path={batch.ir_path} label="IR" />
        <BatchImage path={batch.white_path} label="LED" />
      </div>
      <span className="text-xs font-medium text-foreground">Batch {batch.batch_number}</span>
    </div>
  )
}
