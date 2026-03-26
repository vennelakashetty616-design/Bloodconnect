"use client"

import { HeartbeatIcon } from '@/components/ui/HeartbeatIcon'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-[linear-gradient(135deg,#fff7ef_0%,#fff3d4_52%,#fff2f3_100%)]">
      <motion.div
        className="pointer-events-none absolute -left-20 top-20 h-80 w-80 rounded-full bg-red-200/45 blur-3xl"
        animate={{ y: [0, -24, 0], x: [0, 12, 0], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-20 bottom-16 h-96 w-96 rounded-full bg-amber-200/45 blur-3xl"
        animate={{ y: [0, 26, 0], x: [0, -14, 0], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-red-300/0 via-red-400/80 to-red-300/0"
        animate={{ opacity: [0.25, 0.8, 0.25] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-amber-300/0 via-amber-400/80 to-amber-300/0"
        animate={{ opacity: [0.7, 0.2, 0.7] }}
        transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Top branding */}
      <div className="relative z-10 flex justify-center pt-12 pb-6">
        <Link href="/" className="flex flex-col items-center gap-2">
          <HeartbeatIcon size={52} color="#B11226" />
          <span className="text-red-700 text-xs tracking-wide uppercase">Medical Response Network</span>
        </Link>
      </div>

      {/* Auth card */}
      <div className="relative z-10 flex-1 flex items-start justify-center px-4 pb-8">
        <div className="w-full max-w-sm rounded-3xl border border-amber-200/80 bg-white/92 p-6 shadow-[0_18px_48px_rgba(120,53,15,0.14)] backdrop-blur animate-slide-up">
          {children}
        </div>
      </div>
    </div>
  )
}
