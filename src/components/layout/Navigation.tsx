'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Droplet, Bell, User, Plus } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/donor/requests', icon: Droplet, label: 'Donate' },
  { href: '/dashboard', label: 'SOS', isCta: true },
  { href: '/notifications', icon: Bell, label: 'Alerts' },
  { href: '/donor/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()
  const { unreadCount } = useAppStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-200 bg-[linear-gradient(180deg,#fffdf8_0%,#fff4de_100%)] shadow-[0_-4px_24px_rgba(120,53,15,0.1)] safe-area-pb">
      <div className="max-w-lg mx-auto flex items-end justify-around px-2 pt-2 pb-3">
        {NAV_ITEMS.map((item) => {
          if (item.isCta) {
            return (
              <Link
                key="sos"
                href="/request/create"
                className="flex flex-col items-center -mt-6"
              >
                <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-blood-500 to-blood-700 shadow-blood-lg animate-emergency-pulse">
                  <Plus className="text-white" size={26} strokeWidth={3} />
                </span>
                <span className="text-[10px] font-bold text-red-700 mt-1">SOS</span>
              </Link>
            )
          }

          const Icon = item.icon!
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all min-w-[48px]',
                isActive ? 'text-red-700' : 'text-gray-400 hover:text-red-700'
              )}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {item.label === 'Alerts' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-blood-700 text-white text-[9px] font-bold rounded-full">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={cn('text-[10px] font-medium', isActive && 'font-bold')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function TopBar({
  title,
  subtitle,
  back,
  right,
  emergency,
}: {
  title?: string
  subtitle?: string
  back?: boolean
  right?: React.ReactNode
  emergency?: boolean
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 px-4 py-3 flex items-center justify-between',
        emergency
          ? 'bg-gradient-to-r from-blood-700 to-red-700 text-white shadow-blood'
          : 'border-b border-amber-200 bg-[linear-gradient(90deg,rgba(255,253,247,0.95)_0%,rgba(255,243,215,0.9)_100%)] backdrop-blur-sm text-gray-900'
      )}
    >
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={() => history.back()}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-xl',
              emergency ? 'hover:bg-white/20' : 'hover:bg-gray-100'
            )}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {!title && !back && (
          <div className="w-8 h-8" />
        )}
        {title && (
          <div>
            <h1 className={cn('font-bold text-base leading-tight', emergency && 'text-white')}>
              {title}
            </h1>
            {subtitle && (
              <p className={cn('text-xs', emergency ? 'text-red-100' : 'text-gray-500')}>
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>
      {right && <div>{right}</div>}
    </header>
  )
}
