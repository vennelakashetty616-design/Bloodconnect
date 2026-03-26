'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname, useRouter } from 'next/navigation'

type SplashDrop = {
  id: number
  startX: number
  startY: number
  driftX: number
  lift: number
  size: number
  rotate: number
  duration: number
  delay: number
  color: string
}

type SplashState = {
  x: number
  y: number
  drops: SplashDrop[]
}

function isInternalHref(href: string) {
  return href.startsWith('/') || href.startsWith(window.location.origin)
}

function normalizeHref(href: string) {
  if (href.startsWith(window.location.origin)) {
    const url = new URL(href)
    return `${url.pathname}${url.search}${url.hash}`
  }

  return href
}

function createDrops(originX: number): SplashDrop[] {
  const palette = ['#B11226', '#C62828', '#B11226', '#C62828', '#B11226', '#C62828']
  const width = window.innerWidth
  const height = window.innerHeight
  const count = Math.max(28, Math.min(44, Math.floor(width / 34)))
  const clickBias = (originX - width / 2) / Math.max(width, 1)

  return Array.from({ length: count }, (_, index) => {
    const lane = count === 1 ? 0.5 : index / (count - 1)
    const pulseDelay = index % 2 === 0 ? lane * 0.11 : 0.09 + lane * 0.11
    const localBias = clickBias * 70

    return {
      id: Date.now() + index,
      startX: lane * width + (Math.random() * 36 - 18) + localBias * (0.25 + Math.random() * 0.35),
      startY: -90 - Math.random() * 120,
      driftX: (Math.random() * 70 - 35) + localBias,
      lift: height + 260 + Math.random() * 180,
      size: 26 + Math.random() * 54,
      rotate: -18 + Math.random() * 36,
      duration: 1.1 + Math.random() * 0.42,
      delay: pulseDelay,
      color: palette[index % palette.length],
    }
  })
}

export function BloodDropClickEffect() {
  const router = useRouter()
  const pathname = usePathname()
  const [splash, setSplash] = useState<SplashState | null>(null)
  const resetTimerRef = useRef<number | null>(null)
  const navigationTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!splash) return

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      setSplash(null)
      resetTimerRef.current = null
    }, 1580)
  }, [pathname, splash])

  useEffect(() => {
    function triggerSplash(x: number, y: number) {
      setSplash({
        x,
        y,
        drops: createDrops(x),
      })
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      if (!target) return

      const interactive = target.closest('a, button, [role="button"]') as HTMLElement | null
      if (!interactive) return

      const rect = interactive.getBoundingClientRect()
      const x = event.clientX || rect.left + rect.width / 2
      const y = event.clientY || rect.top + rect.height / 2

      triggerSplash(x, y)

      const anchor = interactive.closest('a') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.href
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      if (!isInternalHref(href)) return

      const nextHref = normalizeHref(href)
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (nextHref === currentHref) return

      event.preventDefault()
      event.stopPropagation()

      if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current)
      navigationTimerRef.current = window.setTimeout(() => {
        router.push(nextHref)
        navigationTimerRef.current = null
      }, 860)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [router])

  return (
    <div className="pointer-events-none fixed inset-0 z-[180] overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {splash && (
          <>
            <motion.div
              key="blood-heartbeat"
              className="absolute rounded-full bg-[radial-gradient(circle,rgba(248,113,113,0.5)_0%,rgba(153,27,27,0.62)_42%,rgba(69,10,10,0)_72%)]"
              style={{ left: splash.x, top: splash.y, width: 96, height: 96 }}
              initial={{ x: -48, y: -48, scale: 0.08, opacity: 0.9 }}
              animate={{
                x: -48,
                y: -48,
                scale: [0.08, 0.88, 0.72, 1.08],
                opacity: [0.9, 0.82, 0.52, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.74, times: [0, 0.28, 0.56, 1], ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              key="blood-shine"
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_28%,rgba(255,255,255,0)_100%)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.22, 0.08] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.98, times: [0, 0.35, 1] }}
            />
            {splash.drops.map((drop) => (
              <motion.svg
                key={drop.id}
                viewBox="0 0 40 60"
                className="absolute overflow-visible"
                style={{
                  left: drop.startX,
                  top: drop.startY,
                  width: drop.size,
                  height: drop.size * 1.45,
                  filter: 'drop-shadow(0 0 8px rgba(69,10,10,0.38))',
                }}
                initial={{ x: -drop.size / 2, y: 0, opacity: 0, scale: 0.72, rotate: drop.rotate }}
                animate={{
                  x: [-drop.size / 2, drop.driftX - drop.size / 2],
                  y: [0, drop.lift],
                  opacity: [0, 1, 1, 0],
                  scale: [0.72, 1, 1.02, 0.96],
                  rotate: [drop.rotate, drop.rotate + (drop.driftX > 0 ? 8 : -8), drop.rotate + (drop.driftX > 0 ? 10 : -10)],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: drop.duration, delay: drop.delay, times: [0, 0.16, 0.82, 1], ease: [0.22, 1, 0.36, 1] }}
              >
                <path
                  d="M20 2 C20 2 4 23 4 37 C4 49 11 58 20 58 C29 58 36 49 36 37 C36 23 20 2 20 2Z"
                  fill={`url(#drop-gradient-${drop.id})`}
                  stroke="rgba(248,113,113,0.24)"
                  strokeWidth="1.1"
                />
                <defs>
                  <radialGradient id={`drop-gradient-${drop.id}`} cx="34%" cy="24%" r="68%">
                    <stop offset="0%" stopColor="rgba(254,226,226,0.42)" />
                    <stop offset="26%" stopColor={drop.color} />
                    <stop offset="100%" stopColor="#B11226" />
                  </radialGradient>
                </defs>
                <ellipse cx="14" cy="16" rx="4.2" ry="7.5" fill="rgba(255,255,255,0.14)" transform="rotate(-22 14 16)" />
              </motion.svg>
            ))}
            <motion.div
              key="blood-fade"
              className="absolute inset-0 bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.14, times: [0, 0.42, 1] }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
