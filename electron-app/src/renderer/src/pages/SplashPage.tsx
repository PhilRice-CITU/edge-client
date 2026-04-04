import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { SPLASH_DURATION_MS } from '@renderer/lib/constants'

export function SplashPage() {
  const navigate = useNavigate()
  const { data: status, isError } = useDeviceStatus()
  const minTimeElapsed = useRef(false)
  const statusReady = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      minTimeElapsed.current = true
      if (statusReady.current) {
        navigate({ to: '/home' })
      }
    }, SPLASH_DURATION_MS)
    return () => clearTimeout(timer)
  }, [navigate])

  useEffect(() => {
    if ((status || isError) && !statusReady.current) {
      statusReady.current = true
      if (minTimeElapsed.current) {
        navigate({ to: '/home' })
      }
    }
  }, [status, isError, navigate])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-16 w-16 animate-pulse rounded-2xl bg-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Rice Vision</h1>
        <p className="text-sm text-muted-foreground">PNS/BAFS 290:2025 Grading System</p>
      </div>
      {status && (
        <p className="text-xs text-muted-foreground">{status.device_id}</p>
      )}
    </div>
  )
}
