import { useEffect, useRef, useState } from 'react'
import { VideoOff } from 'lucide-react'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import { cn } from '@renderer/lib/utils'

interface CameraPreviewProps {
  isCapturing?: boolean
  className?: string
}

const POLL_INTERVAL_OK = 800
// How long to wait after a failure before retrying (ms)
const POLL_INTERVAL_FAIL = 5_000

export function CameraPreview({ isCapturing = false, className }: CameraPreviewProps) {

  const [tick, setTick] = useState(0)
  const [available, setAvailable] = useState(true)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevCapturing = useRef(isCapturing)
  useEffect(() => {
    if (prevCapturing.current && !isCapturing) {
      setTick((t) => t + 1)
    }
    prevCapturing.current = isCapturing
  }, [isCapturing])

  useEffect(() => {
    if (isCapturing) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const delay = available ? POLL_INTERVAL_OK : POLL_INTERVAL_FAIL

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (!available) {
        setAvailable(true)
      }
      setTick((t) => t + 1)
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

  }, [tick, available])

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-muted',
        !available && 'flex aspect-video items-center justify-center',
        className,
      )}
    >
      {/* Always render the img so onLoad/onError fire; hide it when unavailable */}
      <img
        key={tick}
        src={`${FLASK_BASE_URL}/preview/frame?t=${tick}`}
        alt="Live camera preview"
        className={cn(
          'aspect-video w-full object-cover',
          !available && 'hidden',
        )}
        onLoad={() => {
          // Mark the camera as available on the first successful frame.
          if (!available) setAvailable(true)
        }}
        onError={() => setAvailable(false)}
      />

      {/* Unavailable overlay — shown instead of the image */}
      {!available && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <VideoOff className="h-5 w-5 opacity-50" />
          Camera unavailable
        </div>
      )}

      {/* Capture-in-progress overlay */}
      {isCapturing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
          <div className="h-8 w-8 animate-ping rounded-full bg-white/80" />
          <p className="text-xs font-medium text-white">Capturing…</p>
        </div>
      )}
    </div>
  )
}
