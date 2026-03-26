'use client'
import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Profile, Donor } from '@/types'
import { useAppStore } from '@/store/appStore'

function isDemoSession() {
  if (typeof window === 'undefined') return false
  return document.cookie.includes('demo_mode=true') || localStorage.getItem('demo_mode') === 'true'
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
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()

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
          const { data: donorData } = await supabase
            .from('donors')
            .select('*')
            .eq('user_id', session.user.id)
            .single()

          if (donorData) setDonor(donorData as Donor)
        } else {
          if (isDemoSession()) {
            const storedProfileRaw = localStorage.getItem('fuellife_demo_profile_current')
            if (storedProfileRaw) {
              const storedProfile = JSON.parse(storedProfileRaw) as Profile
              setUser(storedProfile)
            } else {
              setUser(null)
            }

            const emailKey = (JSON.parse(localStorage.getItem('fuellife_demo_profile_current') || '{}')?.email || '').toLowerCase()
            const donorRaw = emailKey ? localStorage.getItem(`fuellife_demo_donor_${emailKey}`) : null
            if (donorRaw) {
              setDonor(JSON.parse(donorRaw) as Donor)
            } else {
              setDonor(null)
            }
          } else {
            setUser(null)
            setDonor(null)
          }
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') {
      localStorage.removeItem('demo_mode')
      document.cookie = 'demo_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    }
    useAppStore.getState().reset()
  }

  return { user, donor, loading, signOut }
}
