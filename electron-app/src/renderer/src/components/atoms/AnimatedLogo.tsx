import { motion } from 'framer-motion'

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
}

const petalVariants = {
  hidden: { opacity: 0, scale: 0, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
  },
}

interface AnimatedLogoProps {
  size?: number
  animate?: boolean
}

export function AnimatedLogo({ size = 64, animate = true }: AnimatedLogoProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      variants={containerVariants}
      initial={animate ? 'hidden' : 'show'}
      animate="show"
      className="text-primary"
    >
      {/* Top Left Petal */}
      <motion.path
        variants={petalVariants}
        fill="currentColor"
        d="M 46 46 L 26 46 A 16 16 0 0 1 10 30 L 10 26 A 16 16 0 0 1 26 10 L 30 10 A 16 16 0 0 1 46 26 Z"
      />
      {/* Top Right Petal */}
      <motion.path
        variants={petalVariants}
        fill="currentColor"
        d="M 54 46 L 54 26 A 16 16 0 0 1 70 10 L 74 10 A 16 16 0 0 1 90 26 L 90 30 A 16 16 0 0 1 74 46 Z"
      />
      {/* Bottom Right Petal */}
      <motion.path
        variants={petalVariants}
        fill="currentColor"
        d="M 54 54 L 74 54 A 16 16 0 0 1 90 70 L 90 74 A 16 16 0 0 1 74 90 L 70 90 A 16 16 0 0 1 54 74 Z"
      />
      {/* Bottom Left Petal */}
      <motion.path
        variants={petalVariants}
        fill="currentColor"
        d="M 46 54 L 46 74 A 16 16 0 0 1 30 90 L 26 90 A 16 16 0 0 1 10 74 L 10 70 A 16 16 0 0 1 26 54 Z"
      />
    </motion.svg>
  )
}
