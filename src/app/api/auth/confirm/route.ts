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
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Sign in the user (this works even if email not confirmed)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInError) {
      console.log('[confirm] SignIn error:', signInError.message)
      return NextResponse.json({ error: signInError.message }, { status: 401 })
    }

    // Call login endpoint to get cookies
    const origin = req.nextUrl.origin
    const loginRes = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    })

    if (!loginRes.ok) {
      return NextResponse.json({ error: 'Session establishment failed' }, { status: loginRes.status })
    }

    const setCookieHeaders = loginRes.headers.getSetCookie()
    const response = NextResponse.json({ ok: true })
    
    setCookieHeaders.forEach(cookieHeader => {
      response.headers.append('set-cookie', cookieHeader)
    })

    return response
  } catch (err: any) {
    console.error('[confirm] Error:', err.message)
    return NextResponse.json({ error: err.message ?? 'Confirmation failed' }, { status: 500 })
  }
}
