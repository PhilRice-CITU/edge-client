import { useEffect, useState } from 'react'
import { VideoOff } from 'lucide-react'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import { cn } from '@renderer/lib/utils'

interface CameraPreviewProps {
  isCapturing?: boolean
  className?: string
}

export function CameraPreview({ isCapturing = false, className }: CameraPreviewProps) {
  const [tick, setTick] = useState(0)
  const [available, setAvailable] = useState(true)

  // Poll every 800 ms when camera is working; retry every 5 s when unavailable
  useEffect(() => {
    const delay = available ? 800 : 5_000
    const id = setTimeout(() => {
      setTick((t) => t + 1)
      if (!available) setAvailable(true) // attempt recovery on each retry
    }, delay)
    return () => clearTimeout(id)
  }, [tick, available])

  if (!available) {
    return (
      <div
        className={cn(
          'flex aspect-video w-full items-center justify-center gap-2 rounded-2xl bg-muted text-sm text-muted-foreground',
          className,
        )}
      >
        <VideoOff className="h-5 w-5 opacity-50" />
        Camera unavailable
      </div>
    )
  }

  return (
    <div className={cn('relative w-full overflow-hidden rounded-2xl bg-muted', className)}>
      <img
        key={tick}
        src={`${FLASK_BASE_URL}/preview/frame?t=${tick}`}
        alt="Live camera preview"
        className="aspect-video w-full object-cover"
        onError={() => setAvailable(false)}
      />
      {isCapturing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-8 w-8 animate-ping rounded-full bg-white/80" />
        </div>
      )}
    </div>
  )
}
