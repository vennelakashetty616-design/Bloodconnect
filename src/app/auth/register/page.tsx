'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { User, Mail, Phone, Lock, Droplet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { BLOOD_GROUPS } from '@/types'

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(10, 'Enter a valid phone number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const),
  want_to_donate: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  const { register, handleSubmit, watch, trigger, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { want_to_donate: true },
  })

  const wantToDonate = watch('want_to_donate')

  async function nextStep() {
    const valid = await trigger(['full_name', 'email', 'phone', 'password'])
    if (valid) setStep(2)
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const normalizedEmail = data.email.trim().toLowerCase()

      // Use server-side API endpoint to sign up and establish auth cookies
      console.log('[register] Calling /api/auth/register with:', { email: normalizedEmail, full_name: data.full_name })
      
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password: data.password,
          full_name: data.full_name,
          phone: data.phone,
          blood_group: data.blood_group,
          want_to_donate: data.want_to_donate ?? true,
          role: data.want_to_donate ? 'both' : 'requester',
        }),
      })

      console.log('[register] API response status:', res.status)
      
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.log('[register] Error response:', json)
        if (res.status === 429 || json.code === 'EMAIL_RATE_LIMIT') {
          toast('Too many verification emails sent. Check your inbox/spam for the latest mail and retry after 60 seconds.', {
            icon: '⏳',
          })
          router.push('/auth/confirmed')
          return
        }
        throw new Error(json.error ?? `Registration failed (${res.status})`)
      }

      const json = await res.json()
      console.log('[register] Success! Response:', json)
      if (json.requires_email_confirmation) {
        toast.success('Account created. Please confirm your email to continue.')
        router.push('/auth/confirmed')
        return
      }

      console.log('[register] Session established, redirecting to dashboard...')
      toast.success('Account created! Welcome 🩸')
      await new Promise(resolve => setTimeout(resolve, 800))
      window.location.href = '/auth/profile-setup?redirect=/dashboard'
    } catch (err: any) {
      console.error('[register] Error caught:', err.message, err)
      toast.error(err.message ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 mb-1">
        {step === 1 ? 'Create your account' : 'Your blood profile'}
      </h2>
      <p className="text-base text-gray-600 mb-6">
        {step === 1 ? 'Join thousands of life-savers near you.' : 'One more step to become a hero.'}
      </p>

      {/* Progress */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 h-1 rounded-full bg-red-600" />
        <div className={`flex-1 h-1 rounded-full ${step === 2 ? 'bg-amber-500' : 'bg-gray-200'}`} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {step === 1 && (
          <div className="space-y-4">
            <Input
              label="Full Name"
              placeholder="Aanya Sharma"
              icon={<User size={16} />}
              error={errors.full_name?.message}
              {...register('full_name')}
            />
            <Input
              label="Email"
              type="email"
              placeholder="aanya@example.com"
              icon={<Mail size={16} />}
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+91 98765 43210"
              icon={<Phone size={16} />}
              error={errors.phone?.message}
              {...register('phone')}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              icon={<Lock size={16} />}
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="button" variant="primary" fullWidth size="lg" onClick={nextStep}>
              Continue →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Select
              label="Your Blood Group"
              className="border-amber-300 py-3.5 text-lg font-semibold focus:border-red-500 focus:ring-amber-100"
              options={[
                { value: '', label: 'Select blood group...' },
                ...BLOOD_GROUPS.map((g) => ({ value: g, label: g })),
              ]}
              error={errors.blood_group?.message}
              {...register('blood_group')}
            />

            <div className="p-4 rounded-xl border border-gray-100 bg-neutral-offwhite">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-5 h-5 rounded accent-red-600"
                  {...register('want_to_donate')}
                />
                <div>
                  <p className="text-base font-bold text-gray-900">Register as a blood donor</p>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
                    You&apos;ll appear on searches and receive emergency alerts when nearby patients need your blood type.
                  </p>
                </div>
              </label>
            </div>

            {wantToDonate && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-red-700">
                🩸 You can toggle your availability at any time from your profile. Donors receive a trust score based on response history.
              </div>
            )}

            <div className="flex gap-3">
              <Button type="button" variant="outline" fullWidth size="lg" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button type="submit" variant="primary" fullWidth size="lg" loading={loading}
                icon={<Droplet size={18} />}
              >
                Join Now
              </Button>
            </div>
          </div>
        )}
      </form>

      <p className="mt-5 text-center text-xs text-gray-400">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-bold text-red-700">Sign in</Link>
      </p>
    </div>
  )
}
