import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

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
    const origin = req.nextUrl.origin
    const { email, password, full_name, phone, blood_group, want_to_donate, role } = body

    console.log('[api/auth/register] Incoming request:', { email, full_name })

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const emailRedirectTo = `${origin}/auth/callback?next=/auth/login`

    // Sign up the user with profile metadata
    console.log('[api/auth/register] Attempting signUp for:', normalizedEmail)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name,
          phone,
          role,
          blood_group,
          want_to_donate,
        },
      },
    })

    if (signUpError) {
      console.log('[api/auth/register] SignUp error:', signUpError)
      const msg = (signUpError.message ?? '').toLowerCase()
      if (msg.includes('rate limit') || msg.includes('too many')) {
        return NextResponse.json(
          {
            error: 'Email rate limit exceeded. Please wait a minute, then try again. If you already registered, use the confirmation email already sent.',
            code: 'EMAIL_RATE_LIMIT',
          },
          { status: 429 }
        )
      }
      return NextResponse.json({ error: signUpError.message }, { status: 400 })
    }

    if (!signUpData.user) {
      console.log('[api/auth/register] No user returned from signup')
      return NextResponse.json({ error: 'Account creation failed' }, { status: 400 })
    }

    const hasSession = Boolean(signUpData.session)
    const response = NextResponse.json({
      ok: true,
      requires_email_confirmation: !hasSession,
    })

    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (err: any) {
    console.error('[api/auth/register] Caught exception:', err.message, err.stack)
    return NextResponse.json({ error: err.message ?? 'Registration failed' }, { status: 500 })
  }
}
