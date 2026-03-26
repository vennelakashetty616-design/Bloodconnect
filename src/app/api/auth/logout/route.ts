import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

function normalizeCookieOptions(options?: Record<string, unknown>) {
  const nextOptions = { ...(options ?? {}) }
  if (process.env.NODE_ENV !== 'production') {
    nextOptions.secure = false
    if (!nextOptions.sameSite) nextOptions.sameSite = 'lax'
  }
  if (!nextOptions.path) nextOptions.path = '/'
  return nextOptions
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, '', {
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  })
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
    await supabase.auth.signOut()

    const response = NextResponse.json({ ok: true })

    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, normalizeCookieOptions(options))
    })

    const cookieNamesToClear = req.cookies
      .getAll()
      .map((c) => c.name)
      .filter((name) =>
        name === 'demo_mode' ||
        name.includes('-auth-token') ||
        name.includes('-auth-token-code-verifier')
      )

    cookieNamesToClear.forEach((name) => clearCookie(response, name))

    return response
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Logout failed' }, { status: 500 })
  }
}
