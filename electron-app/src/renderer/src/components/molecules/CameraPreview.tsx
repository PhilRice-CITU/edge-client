import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

const PREVIEW_URL = 'http://127.0.0.1:5056/preview/frame'
const POLL_INTERVAL_MS = 1200

interface CameraPreviewProps {
  paused?: boolean
  overlayLabel?: string | null
}

export function CameraPreview({ paused = false, overlayLabel = null }: CameraPreviewProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const lastObjectUrl = useRef<string | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false

    async function tick(): Promise<void> {
      if (cancelled.current || paused) return
      try {
        const res = await fetch(PREVIEW_URL, { cache: 'no-store' })
        if (!res.ok) {
          if (res.status === 503) {
            return
          }
          setUnavailable(true)
          return
        }
        const blob = await res.blob()
        if (cancelled.current) return
        const url = URL.createObjectURL(blob)
        if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current)
        lastObjectUrl.current = url
        setFrameUrl(url)
        setUnavailable(false)
      } catch {
        setUnavailable(true)
      }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled.current = true
      clearInterval(id)
      if (lastObjectUrl.current) {
        URL.revokeObjectURL(lastObjectUrl.current)
        lastObjectUrl.current = null
      }
    }
  }, [paused])

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted">
      <div className="aspect-square w-full">
        {frameUrl ? (
          <img src={frameUrl} alt="Camera preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {unavailable ? 'Preview unavailable' : 'Starting preview…'}
          </div>
        )}
      </div>

      {overlayLabel && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/60 text-white">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm font-medium">{overlayLabel}</span>
        </div>
      )}
    </div>
  )
}
