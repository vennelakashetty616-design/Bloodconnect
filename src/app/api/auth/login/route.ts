import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }
const DEFAULT_DEMO_EMAIL = 'test@fuellife.com'
const DEFAULT_DEMO_PASSWORD = 'TestPass@123'

function isDefaultDemoCredential(email: string, password: string) {
  return email.trim().toLowerCase() === DEFAULT_DEMO_EMAIL && password === DEFAULT_DEMO_PASSWORD
}

async function autoConfirmEmailForDev(email: string) {
  if (process.env.NODE_ENV === 'production') return false

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) return false

  const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers()
  if (usersErr || !usersData?.users) return false

  const foundUser = usersData.users.find((u) => (u.email ?? '').toLowerCase() === email)
  if (!foundUser) return false

  const { error: confirmErr } = await admin.auth.admin.updateUserById(foundUser.id, {
    email_confirm: true,
  })

  return !confirmErr
}

export async function POST(req: NextRequest) {
  const pendingCookies: CookieToSet[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          pendingCookies.push(...cookiesToSet)
        },
      },
    }
  )

  try {
    const body = await req.json()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (isDefaultDemoCredential(email, password)) {
      const response = NextResponse.json({ ok: true, demo_mode: true })
      response.cookies.set('demo_mode', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
        secure: false,
      })
      return response
    }

    // Try to sign in
    let { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error && error.message?.toLowerCase().includes('email not confirmed')) {
      const confirmed = await autoConfirmEmailForDev(email)
      if (confirmed) {
        const retry = await supabase.auth.signInWithPassword({ email, password })
        error = retry.error
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (err: any) {
    console.error('[api/auth/login] Error:', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Login failed' }, { status: 500 })
  }
}
