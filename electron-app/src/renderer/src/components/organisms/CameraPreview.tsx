import { useEffect, useRef, useState } from 'react'
import { VideoOff } from 'lucide-react'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import { cn } from '@renderer/lib/utils'

interface CameraPreviewProps {
  isCapturing?: boolean
  className?: string
}

const POLL_INTERVAL_OK = 800
const POLL_INTERVAL_FAIL = 5_000
const MAX_CONSECUTIVE_FAILURES = 3

export function CameraPreview({ isCapturing = false, className }: CameraPreviewProps) {
  const [tick, setTick] = useState(0)
  const [available, setAvailable] = useState(true)

  const failCountRef = useRef(0)
  const [collapsed, setCollapsed] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevCapturing = useRef(isCapturing)
  useEffect(() => {
    if (prevCapturing.current && !isCapturing) {
      failCountRef.current = 0
      setCollapsed(false)
      setAvailable(true)
      setTick((t) => t + 1)
    }
    prevCapturing.current = isCapturing
  }, [isCapturing])

  useEffect(() => {
    if (collapsed || isCapturing) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const delay = available ? POLL_INTERVAL_OK : POLL_INTERVAL_FAIL

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setTick((t) => t + 1)
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [tick, available, collapsed, isCapturing])

  const handleLoad = () => {
    failCountRef.current = 0
    if (!available) setAvailable(true)
  }

  const handleError = () => {
    failCountRef.current += 1
    setAvailable(false)
    if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
      setCollapsed(true)
    }
  }

  if (collapsed) {
    return null
  }

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-muted',
        !available && 'flex aspect-video items-center justify-center',
        className,
      )}
    >
      {/* Always mount the img so onLoad / onError fire; hide when unavailable */}
      <img
        key={tick}
        src={`${FLASK_BASE_URL}/preview/frame?t=${tick}`}
        alt="Live camera preview"
        className={cn('aspect-video w-full object-cover', !available && 'hidden')}
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Unavailable overlay — shown instead of the image while retrying */}
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
