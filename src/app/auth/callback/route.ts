import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/auth/confirmed'
  const pendingCookies: CookieToSet[] = []

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_token`)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          pendingCookies.push(...cookiesToSet)
        },
      },
    }
  )

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! })

  if (error) {
    console.error('[auth/callback] auth callback error:', error.message)
    return NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`)
  }

  // After confirming, create the profile from user metadata if it doesn't exist yet
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const meta = user.user_metadata ?? {}

    // Create profile row (upsert is safe to call multiple times)
    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: meta.full_name ?? '',
      phone: meta.phone ?? '',
      email: user.email!,
      role: meta.role ?? 'both',
    })

    // Create donor row if the user opted in
    if (meta.want_to_donate && meta.blood_group) {
      await supabase.from('donors').upsert(
        {
          user_id: user.id,
          blood_group: meta.blood_group,
          is_available: true,
          last_donation_date: null,
          latitude: null,
          longitude: null,
        },
        { onConflict: 'user_id' }
      )
    }
  }

  const response = NextResponse.redirect(`${origin}${next}`)
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
