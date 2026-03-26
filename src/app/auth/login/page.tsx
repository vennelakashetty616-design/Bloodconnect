'use client'
import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Activity } from 'lucide-react'
import { motion } from 'framer-motion'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAppStore } from '@/store/appStore'
import { Profile } from '@/types'

const DEFAULT_SIGNIN_EMAIL = 'test@fuellife.com'
const DEFAULT_SIGNIN_PASSWORD = 'TestPass@123'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect') ?? '/dashboard'
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setUser } = useAppStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: DEFAULT_SIGNIN_EMAIL,
      password: DEFAULT_SIGNIN_PASSWORD,
    },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const normalizedEmail = data.email.trim().toLowerCase()

      // Demo mode
      if (!isSupabaseConfigured()) {
        const emailKey = normalizedEmail
        const storedProfile = localStorage.getItem(`fuellife_demo_profile_${emailKey}`)
        const demoSetupDone = localStorage.getItem(`fuellife_demo_profile_setup_${emailKey}`) === 'true'
        const now = new Date().toISOString()
        const demoProfile: Profile = storedProfile
          ? JSON.parse(storedProfile)
          : {
              id: `demo-${emailKey}`,
              full_name: emailKey.split('@')[0],
              phone: '',
              email: normalizedEmail,
              role: 'both',
              created_at: now,
              updated_at: now,
            }
        setUser(demoProfile)
        localStorage.setItem('fuellife_demo_profile_current', JSON.stringify(demoProfile))
        toast.success('Welcome back!')
        const nextPath = demoSetupDone
          ? redirect
          : `/auth/profile-setup?redirect=${encodeURIComponent(redirect)}`
        window.location.href = nextPath
        return
      }

      // Server-side login sets auth cookie so middleware can see the session
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password: data.password }),
      })
      
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Login failed')
      }

      const loginJson = await res.json().catch(() => ({}))
      if (loginJson?.demo_mode) {
        const now = new Date().toISOString()
        const demoProfile: Profile = {
          id: 'demo-test',
          full_name: 'Test User',
          phone: '+91 9876543210',
          email: DEFAULT_SIGNIN_EMAIL,
          role: 'both',
          created_at: now,
          updated_at: now,
          basic_profile_setup_completed: true,
        }
        setUser(demoProfile)
        localStorage.setItem('fuellife_demo_profile_current', JSON.stringify(demoProfile))
        localStorage.setItem('demo_mode', 'true')
        localStorage.setItem(`fuellife_demo_profile_setup_${DEFAULT_SIGNIN_EMAIL}`, 'true')
        toast.success('Signed in with default demo account.')
        window.location.href = redirect
        return
      }

        let target = redirect
        let needsSetup = false
        try {
          const setupRes = await fetch('/api/auth/profile', { method: 'GET' })
          if (setupRes.ok) {
            const setupJson = await setupRes.json()
            if (!setupJson?.completed) {
              target = `/auth/profile-setup?redirect=${encodeURIComponent(redirect)}`
              needsSetup = true
            }
          }
        } catch {
          // Ignore profile setup check failures and continue to redirect.
        }

        toast.success(needsSetup ? 'Login successful. Please complete your basic profile setup to continue.' : 'Welcome back!')
      // Use hard redirect to ensure cookies are read by server on next page load
        window.location.href = target
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase()
      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        toast.error('Wrong email or password. Double-check and try again.')
      } else if (msg.includes('email not confirmed') || msg.includes('confirm your email')) {
        toast.error('Please verify your email first, then sign in.')
      } else if (msg.includes('rate limit') || msg.includes('too many requests')) {
        toast.error('Too many attempts. Please wait a few minutes and try again.')
      } else {
        toast.error(err?.message ?? 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700">
            Secure Access
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700">
            Live Network
          </span>
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-1">Sign in to your dashboard</h2>
        <p className="text-sm text-slate-600">Track requests, coordinate donors, and respond faster.</p>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          className="border-amber-200 bg-white/95 focus:border-red-400 focus:ring-red-100"
          icon={<Mail size={16} />}
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
          className="border-amber-200 bg-white/95 focus:border-red-400 focus:ring-red-100"
          icon={<Lock size={16} />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" variant="primary" fullWidth size="lg" loading={loading} className="bg-red-600 text-white shadow-[0_10px_24px_rgba(177,18,38,0.25)] hover:bg-red-700 focus:ring-red-500">
          Sign In
        </Button>
      </form>

      <div className="mt-5 text-center">
        <p className="mb-2 text-xs text-amber-800">
          Default login: {DEFAULT_SIGNIN_EMAIL} / {DEFAULT_SIGNIN_PASSWORD}
        </p>
        <p className="text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-red-700 font-bold hover:underline">
            Join now
          </Link>
        </p>
      </div>

      <button 
        type="button"
        onClick={async () => {
          try {
            const now = new Date().toISOString()
            const demoProfile: Profile = {
              id: 'demo-test',
              full_name: 'Test User',
              phone: '+91 9876543210',
              email: 'test@fuellife.com',
              role: 'both',
              created_at: now,
              updated_at: now,
            }
            setUser(demoProfile)
            localStorage.setItem('fuellife_demo_profile_current', JSON.stringify(demoProfile))
            localStorage.setItem('demo_mode', 'true')
            // Request demo endpoint to set cookie server-side
            await fetch('/api/demo', { method: 'GET' })
            // Then redirect after a brief delay
            setTimeout(() => {
              window.location.href = '/dashboard'
            }, 100)
          } catch (error) {
            console.error('Demo error:', error)
            toast.error('Failed to enter demo mode')
            // Fallback redirect anyway
            setTimeout(() => {
              window.location.href = '/dashboard'
            }, 500)
          }
        }}
        className="mt-4 w-full rounded-2xl border-2 border-amber-200 bg-[linear-gradient(135deg,#fff9ec_0%,#fff2cb_100%)] px-4 py-3 text-base font-black text-red-700 transition-all active:scale-95 hover:border-red-300 hover:bg-[linear-gradient(135deg,#fff7e0_0%,#ffeeb8_100%)]"
      >
        Quick Demo - Open Dashboard
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-4 space-y-2"
      >
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-red-800">
          <ShieldCheck size={14} /> End-to-end encrypted account sessions
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-red-800">
          <Activity size={14} /> Real-time emergency dispatch available 24/7
        </div>
      </motion.div>
    </div>
  )
}
