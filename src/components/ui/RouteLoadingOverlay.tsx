'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AppLoadingScreen } from '@/components/ui/AppLoadingScreen'

function isLocalNavigationAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const anchor = target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement)) return false

  if (anchor.target && anchor.target !== '_self') return false
  if (anchor.hasAttribute('download')) return false

  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false

  return true
}

export function RouteLoadingOverlay() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)

  const routeKey = useMemo(() => `${pathname}?${searchParams.toString()}`, [pathname, searchParams])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!isLocalNavigationAnchor(event.target)) return

      const anchor = (event.target as Element).closest('a') as HTMLAnchorElement | null
      if (!anchor) return

      const nextUrl = new URL(anchor.href, window.location.origin)
      const currentUrl = new URL(window.location.href)
      if (nextUrl.origin !== currentUrl.origin) return
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) return

      setIsLoading(true)
    }

    const handleBeforeUnload = () => {
      setIsLoading(true)
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    setIsLoading(false)
  }, [routeKey])

  if (!isLoading) return null
  return <AppLoadingScreen />
}
