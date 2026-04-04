import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { AnimatedLogo } from '@renderer/components/atoms/AnimatedLogo'

export function SplashPage() {
  const navigate = useNavigate()
  const { data: status, isError } = useDeviceStatus()
  const animationsDone = useRef(false)
  const statusReady = useRef(false)

  const tryNavigate = useCallback(() => {
    if (animationsDone.current && statusReady.current) {
      navigate({ to: '/home' })
    }
  }, [navigate])

  useEffect(() => {
    if ((status || isError) && !statusReady.current) {
      statusReady.current = true
      tryNavigate()
    }
  }, [status, isError, tryNavigate])

  const handleLastAnimationComplete = () => {
    animationsDone.current = true
    tryNavigate()
  }

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
            onAnimationComplete={handleLastAnimationComplete}
          >
            PNS/BAFS 290:2025 Grading System
          </motion.p>
        </div>
      </div>
      {status && (
        <motion.p
          className="text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.35 }}
        >
          {status.device_id}
        </motion.p>
      )}
    </div>
  )
}
