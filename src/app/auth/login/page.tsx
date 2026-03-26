'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Activity } from 'lucide-react'
import { motion } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormData = z.infer<typeof schema>

async function waitForSessionReady(supabase: ReturnType<typeof getSupabaseClient>, maxChecks = 8) {
  for (let i = 0; i < maxChecks; i += 1) {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) return true
    } catch {
      // Ignore transient session reads and retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return false
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/dashboard'
  const supabase = getSupabaseClient()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const normalizedEmail = data.email.trim().toLowerCase()
      // Clean up legacy demo cookie if it exists.
      document.cookie = 'demo_mode=; Path=/; Max-Age=0; SameSite=Lax'

      let { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: data.password,
      })

      // In local development, allow server route to auto-confirm and then retry client sign-in.
      if (error?.message?.toLowerCase().includes('email not confirmed')) {
        const assist = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail, password: data.password }),
        })

        if (!assist.ok) {
          const assistJson = await assist.json().catch(() => ({}))
          throw new Error(assistJson.error ?? 'Please verify your email first, then sign in.')
        }

        const retry = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: data.password,
        })
        error = retry.error
      } else if (error?.message?.toLowerCase().includes('invalid login credentials')) {
        const recover = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail, password: data.password }),
        })

        if (recover.ok) {
          const retry = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: data.password,
          })
          error = retry.error
        }
      }

      if (error) {
        throw new Error(error.message)
      }

      const sessionReady = await waitForSessionReady(supabase)
      if (!sessionReady) {
        throw new Error('Login succeeded but local session is still initializing. Please retry in a second.')
      }
      toast.success('Welcome back!')
      // Use hard redirect to ensure cookies are read by server on next page load.
      window.location.href = redirect
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
        <p className="text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-red-700 font-bold hover:underline">
            Join now
          </Link>
        </p>
      </div>

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
