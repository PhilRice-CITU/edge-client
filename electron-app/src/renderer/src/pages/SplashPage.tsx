import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatedLogo } from '@renderer/components/atoms/AnimatedLogo'
import { SPLASH_DURATION_MS } from '@renderer/lib/constants'

export function SplashPage() {
  const navigate = useNavigate()
  const minTimerDone = useRef(false)
  const statusReady = useRef(false)
  const deviceIdRef = useRef<string>('')
  const [displayId, setDisplayId] = useState('')

  const tryNavigate = useCallback(() => {
    if (minTimerDone.current && statusReady.current) {
      navigate({ to: deviceIdRef.current ? '/home' : '/setup' })
    }
  }, [navigate])

  // Enforce minimum splash display time
  useEffect(() => {
    const id = setTimeout(() => {
      minTimerDone.current = true
      tryNavigate()
    }, SPLASH_DURATION_MS)
    return () => clearTimeout(id)
  }, [tryNavigate])

  // Read device ID from local .env via IPC — no network call needed
  useEffect(() => {
    window.api.getDeviceId().then((id) => {
      deviceIdRef.current = id
      setDisplayId(id)
      statusReady.current = true
      tryNavigate()
    })
  }, [tryNavigate])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-4">
        <AnimatedLogo size={72} animate={true} />
        <div className="flex flex-col items-center gap-1">
          <motion.h1
            className="text-3xl font-bold tracking-tight text-foreground"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.4 }}
          >
            Hum.ai
          </motion.h1>
          <motion.p
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.4 }}
          >
            PNS/BAFS 290:2025 Grading System
          </motion.p>
        </div>
      </div>
      {displayId && (
        <motion.p
          className="text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.35 }}
        >
          {displayId}
        </motion.p>
      )}
    </div>
  )
}
