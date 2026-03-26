'use client'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface HeartbeatIconProps {
  size?: number
  fast?: boolean
  className?: string
  color?: string
}

export function HeartbeatIcon({ size = 40, fast = false, className, color = '#B11226' }: HeartbeatIconProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn(fast ? 'animate-heartbeat-fast' : 'animate-heartbeat', className)}
      style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
    >
      <path
        d="M50 85 C50 85 10 55 10 30 C10 17 20 8 30 8 C38 8 45 13 50 20 C55 13 62 8 70 8 C80 8 90 17 90 30 C90 55 50 85 50 85Z"
        fill={color}
      />
    </motion.svg>
  )
}

// ECG / heartbeat wave SVG animation
export function HeartbeatWave({ className, bpm = 70 }: { className?: string; bpm?: number }) {
  const speed = Math.max(0.3, 1.5 - (bpm - 60) / 100)

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <motion.svg
        viewBox="0 0 400 60"
        className="w-full"
        preserveAspectRatio="none"
      >
        <motion.path
          d="M0,30 L60,30 L75,10 L90,50 L105,5 L120,55 L135,30 L200,30 L260,30 L275,10 L290,50 L305,5 L320,55 L335,30 L400,30"
          fill="none"
          stroke="#B11226"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: speed,
            ease: 'linear',
            repeat: Infinity,
            repeatType: 'loop',
          }}
        />
      </motion.svg>
    </div>
  )
}

// Ripple pulse effect for map donor dot
export function DonorPulse({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inline-flex rounded-full bg-blood-400 opacity-75 animate-donor-ping"
        style={{ width: size, height: size }}
      />
      <span
        className="relative inline-flex rounded-full bg-blood-600"
        style={{ width: size * 0.6, height: size * 0.6 }}
      />
    </div>
  )
}
