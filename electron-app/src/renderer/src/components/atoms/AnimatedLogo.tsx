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
      viewBox="0 0 84 84"
      variants={containerVariants}
      initial={animate ? 'hidden' : 'show'}
      animate="show"
    >
      {/* Top Left Petal */}
      <motion.path
        variants={petalVariants}
        fill="#EB6925"
        d="M18.7564 0.259533L39 0V20C39 30.4934 30.4934 39 20 39H0V19.258C0 8.85956 8.35887 0.392835 18.7564 0.259533Z"
      />
      {/* Top Right Petal */}
      <motion.path
        variants={petalVariants}
        fill="#EB6925"
        d="M65.2436 0.259533L45 0V20C45 30.4934 53.5066 39 64 39H84V19.258C84 8.85956 75.6411 0.392835 65.2436 0.259533Z"
      />
      {/* Bottom Right Petal */}
      <motion.path
        variants={petalVariants}
        fill="#EB6925"
        d="M65.2436 45.2595L45 45V65C45 75.4934 53.5066 84 64 84H84V64.258C84 53.8596 75.6411 45.3928 65.2436 45.2595Z"
      />
      {/* Bottom Left Petal */}
      <motion.path
        variants={petalVariants}
        fill="#EB6925"
        d="M18.7564 83.7405L39 84V64C39 53.5066 30.4934 45 20 45H0V64.742C0 75.1404 8.35887 83.6072 18.7564 83.7405Z"
      />
    </motion.svg>
  )
}
