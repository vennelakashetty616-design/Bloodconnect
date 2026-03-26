'use client'
import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Profile, Donor } from '@/types'
import { useAppStore } from '@/store/appStore'

function isMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? '').toLowerCase()
  return (
    msg.includes(`could not find the table 'public.${table}'`) ||
    msg.includes(`relation \"${table}\" does not exist`) ||
    err?.code === 'PGRST205' ||
    err?.code === '42P01'
  )
}

export function useAuth() {
  const { user, donor, setUser, setDonor } = useAppStore()
  const [loading, setLoading] = useState(!user)
  const supabase = getSupabaseClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const meta = session.user.user_metadata ?? {}
          const metadataName =
            (meta.full_name as string | undefined) ||
            (meta.name as string | undefined) ||
            (meta.user_name as string | undefined)
          const emailFallback = session.user.email?.split('@')[0] || 'Donor'

          // Fetch profile
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (profileErr && !isMissingTableError(profileErr, 'profiles')) {
            console.warn('[useAuth] profile load failed:', profileErr.message)
          }

          if (profile) {
            const normalizedProfile = {
              ...(profile as Profile),
              full_name: (profile.full_name || '').trim() || metadataName || emailFallback,
              email: profile.email || session.user.email || '',
            }
            setUser(normalizedProfile)
          } else {
            setUser({
              id: session.user.id,
              full_name: metadataName || emailFallback,
              phone: '',
              email: session.user.email || '',
              role: 'both',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          }

          // Fetch donor profile
          const { data: donorData, error: donorErr } = await supabase
            .from('donors')
            .select('*')
            .eq('user_id', session.user.id)
            .single()

          if (donorErr && !isMissingTableError(donorErr, 'donors')) {
            console.warn('[useAuth] donor load failed:', donorErr.message)
          }

          if (donorData) setDonor(donorData as Donor)
        } else {
          setUser(null)
          setDonor(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Continue with client-side signout even if API call fails.
    }

    await supabase.auth.signOut()
    document.cookie = 'demo_mode=; Path=/; Max-Age=0; SameSite=Lax'
    useAppStore.getState().reset()
  }

  return { user, donor, loading, signOut }
}
