'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { CalendarDays, MapPin, Scale, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { useAppStore } from '@/store/appStore'
import { BLOOD_GROUPS, Profile } from '@/types'

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
const DEFAULT_DEMO_EMAIL = 'test@fuellife.com'

const schema = z.object({
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say'] as const),
  weight_kg: z.coerce.number().min(30, 'Enter a valid weight').max(300, 'Enter a valid weight'),
  blood_group: z.enum(BLOOD_GROUP_OPTIONS),
  city: z.string().min(2, 'City is required'),
  pincode: z.string().regex(/^\d{5,6}$/, 'Enter a valid pincode'),
  last_donation_date: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function ProfileSetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/dashboard'
  const { user, setUser } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [prefillLoading, setPrefillLoading] = useState(true)

  const isDemoSession = () => {
    if (typeof window === 'undefined') return false
    return document.cookie.includes('demo_mode=true') || localStorage.getItem('demo_mode') === 'true'
  }

  const getDemoContext = () => {
    const fromStore = (user?.email ?? '').trim().toLowerCase()
    const storedCurrentRaw = typeof window !== 'undefined' ? localStorage.getItem('fuellife_demo_profile_current') : null
    const storedCurrent = storedCurrentRaw ? JSON.parse(storedCurrentRaw) as Partial<Profile> : null
    const fromStorage = (storedCurrent?.email ?? '').trim().toLowerCase()
    const emailKey = fromStore || fromStorage || DEFAULT_DEMO_EMAIL

    return {
      emailKey,
      currentProfile: storedCurrent,
    }
  }

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date_of_birth: '',
      gender: 'prefer_not_to_say',
      blood_group: 'O+',
      city: '',
      pincode: '',
      last_donation_date: '',
    },
  })

  useEffect(() => {
    let isMounted = true

    async function loadSetup() {
      if (!isSupabaseConfigured() || isDemoSession()) {
        const { emailKey } = getDemoContext()
        const setupRaw = emailKey ? localStorage.getItem(`fuellife_demo_profile_setup_data_${emailKey}`) : null
        if (setupRaw) {
          const setup = JSON.parse(setupRaw) as Record<string, unknown>
          if (setup.date_of_birth) setValue('date_of_birth', String(setup.date_of_birth))
          if (setup.gender) setValue('gender', String(setup.gender) as FormData['gender'])
          if (setup.weight_kg) setValue('weight_kg', Number(setup.weight_kg))
          if (setup.blood_group) setValue('blood_group', String(setup.blood_group) as FormData['blood_group'])
          if (setup.city) setValue('city', String(setup.city))
          if (setup.pincode) setValue('pincode', String(setup.pincode))
          if (setup.last_donation_date) setValue('last_donation_date', String(setup.last_donation_date))
        }
        setPrefillLoading(false)
        return
      }

      try {
        const res = await fetch('/api/auth/profile', { method: 'GET' })
        if (!res.ok) {
          if (res.status === 401) {
            router.replace(`/auth/login?redirect=${encodeURIComponent('/auth/profile-setup')}`)
          }
          return
        }

        const json = await res.json()
        if (!isMounted) return

        if (json?.completed) {
          router.replace(redirect)
          return
        }

        const setup = json?.profile_setup ?? {}
        if (setup.date_of_birth) setValue('date_of_birth', String(setup.date_of_birth))
        if (setup.gender) setValue('gender', setup.gender)
        if (setup.weight_kg) setValue('weight_kg', Number(setup.weight_kg))
        if (setup.blood_group) setValue('blood_group', setup.blood_group)
        if (setup.city) setValue('city', String(setup.city))
        if (setup.pincode) setValue('pincode', String(setup.pincode))
        if (setup.last_donation_date) setValue('last_donation_date', String(setup.last_donation_date))
      } catch {
        // Ignore setup prefill failures; form can still be completed manually.
      } finally {
        if (isMounted) setPrefillLoading(false)
      }
    }

    loadSetup()
    return () => {
      isMounted = false
    }
  }, [router, setValue, redirect, user?.email])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      if (!isSupabaseConfigured() || isDemoSession()) {
        const { emailKey, currentProfile } = getDemoContext()

        const payload = {
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          weight_kg: data.weight_kg,
          blood_group: data.blood_group,
          city: data.city.trim(),
          pincode: data.pincode.trim(),
          last_donation_date: data.last_donation_date || null,
        }

        localStorage.setItem(`fuellife_demo_profile_setup_${emailKey}`, 'true')
        localStorage.setItem(`fuellife_demo_profile_setup_data_${emailKey}`, JSON.stringify(payload))

        const now = new Date().toISOString()
        const updatedUser: Profile = {
          id: (user?.id || currentProfile?.id || `demo-${emailKey}`) as string,
          full_name: (user?.full_name || currentProfile?.full_name || emailKey.split('@')[0]) as string,
          phone: (user?.phone || currentProfile?.phone || '+91 9876543210') as string,
          email: emailKey,
          role: (user?.role || currentProfile?.role || 'both') as Profile['role'],
          created_at: (user?.created_at || currentProfile?.created_at || now) as string,
          updated_at: now,
          basic_profile_setup_completed: true,
          date_of_birth: payload.date_of_birth,
          gender: payload.gender,
          weight_kg: payload.weight_kg,
          city: payload.city,
          pincode: payload.pincode,
        }
        setUser(updatedUser)
        localStorage.setItem('fuellife_demo_profile_current', JSON.stringify(updatedUser))
        localStorage.setItem(`fuellife_demo_profile_${emailKey}`, JSON.stringify(updatedUser))

        toast.success('Profile setup completed')
        router.replace(redirect)
        return
      }

      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          weight_kg: data.weight_kg,
          blood_group: data.blood_group,
          city: data.city.trim(),
          pincode: data.pincode.trim(),
          last_donation_date: data.last_donation_date || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to save profile setup')
      }

      toast.success('Profile setup completed')
      router.replace(redirect)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save profile setup')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 mb-1">Basic Profile Setup</h2>
      <p className="text-sm text-gray-600 mb-6">
        Complete this once after email or phone verification.
      </p>

      {prefillLoading ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-red-700">
          Loading your profile details...
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Date of Birth"
            type="date"
            icon={<CalendarDays size={16} />}
            error={errors.date_of_birth?.message}
            {...register('date_of_birth')}
          />

          <Select
            label="Gender"
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
              { value: 'prefer_not_to_say', label: 'Prefer not to say' },
            ]}
            error={errors.gender?.message}
            {...register('gender')}
          />

          <Input
            label="Weight (kg)"
            type="number"
            step="0.1"
            placeholder="65"
            icon={<Scale size={16} />}
            error={errors.weight_kg?.message}
            {...register('weight_kg')}
          />

          <Select
            label="Blood Group"
            options={BLOOD_GROUPS.map((group) => ({ value: group, label: group }))}
            error={errors.blood_group?.message}
            {...register('blood_group')}
          />

          <Input
            label="City"
            placeholder="Your city"
            icon={<MapPin size={16} />}
            error={errors.city?.message}
            {...register('city')}
          />

          <Input
            label="Pincode"
            placeholder="560001"
            icon={<UserRound size={16} />}
            error={errors.pincode?.message}
            {...register('pincode')}
          />

          <Input
            label="Last Donation Date (if any)"
            type="date"
            icon={<CalendarDays size={16} />}
            hint="Leave empty if you have not donated before"
            error={errors.last_donation_date?.message}
            {...register('last_donation_date')}
          />

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            Save and Continue
          </Button>
        </form>
      )}
    </div>
  )
}
