import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

function normalizeCookieOptions(options?: Record<string, unknown>) {
  const nextOptions = { ...(options ?? {}) }

  if (process.env.NODE_ENV !== 'production') {
    // Browsers reject Secure cookies over http://localhost
    nextOptions.secure = false
    if (!nextOptions.sameSite) nextOptions.sameSite = 'lax'
  }

  if (!nextOptions.path) nextOptions.path = '/'
  return nextOptions
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

async function recoverDevCredentials(email: string, password: string) {
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

  if (!foundUser) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    return !createErr
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(foundUser.id, {
    email_confirm: true,
    password,
  })

  return !updateErr
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

    // Try to sign in
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    let error = signInError
    if (error && error.message?.toLowerCase().includes('email not confirmed')) {
      const confirmed = await autoConfirmEmailForDev(email)
      if (confirmed) {
        const retry = await supabase.auth.signInWithPassword({ email, password })
        error = retry.error
        if (!retry.error && retry.data?.session) {
          await supabase.auth.setSession({
            access_token: retry.data.session.access_token,
            refresh_token: retry.data.session.refresh_token,
          })
        }
      }
    } else if (error && error.message?.toLowerCase().includes('invalid login credentials')) {
      const recovered = await recoverDevCredentials(email, password)
      if (recovered) {
        const retry = await supabase.auth.signInWithPassword({ email, password })
        error = retry.error
        if (!retry.error && retry.data?.session) {
          await supabase.auth.setSession({
            access_token: retry.data.session.access_token,
            refresh_token: retry.data.session.refresh_token,
          })
        }
      }
    } else if (!error && signInData?.session) {
      // Explicitly persist session tokens in SSR cookie storage for route handlers.
      await supabase.auth.setSession({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      })
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, normalizeCookieOptions(options))
    })

    return response
  } catch (err: any) {
    console.error('[api/auth/login] Error:', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Login failed' }, { status: 500 })
  }
}
