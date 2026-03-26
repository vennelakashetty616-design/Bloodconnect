import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }
type SessionTokens = { access_token: string; refresh_token: string }
type CookieEntry = { name: string; value: string }

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function parseSessionTokens(value?: string): SessionTokens | null {
  if (!value) return null

  const decoded = decodeURIComponent(value)
  const candidates = [decoded]

  if (decoded.startsWith('base64-')) {
    try {
      candidates.push(Buffer.from(decoded.slice(7), 'base64').toString('utf8'))
    } catch {
      // Ignore and continue with other candidates
    }
  }

  if (decoded.startsWith('base64url-')) {
    try {
      candidates.push(decodeBase64Url(decoded.slice(10)))
    } catch {
      // Ignore and continue with other candidates
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.access_token === 'string' &&
        typeof parsed.refresh_token === 'string'
      ) {
        return {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        }
      }
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const [accessToken, refreshToken] = parsed
        if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
          return { access_token: accessToken, refresh_token: refreshToken }
        }
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.currentSession &&
        typeof parsed.currentSession === 'object' &&
        typeof (parsed.currentSession as any).access_token === 'string' &&
        typeof (parsed.currentSession as any).refresh_token === 'string'
      ) {
        return {
          access_token: (parsed.currentSession as any).access_token,
          refresh_token: (parsed.currentSession as any).refresh_token,
        }
      }
    } catch {
      // Try next decode strategy
    }
  }

  return null
}

function getAuthCookieValue(cookieList: CookieEntry[]) {
  const authCookies = cookieList.filter(
    (c) => c.name.includes('-auth-token') && !c.name.includes('-code-verifier')
  )

  const grouped = new Map<string, { base?: string; chunks: Array<{ index: number; value: string }> }>()

  authCookies.forEach(({ name, value }) => {
    const chunkMatch = name.match(/^(.*-auth-token)\.(\d+)$/)
    if (chunkMatch) {
      const base = chunkMatch[1]
      const index = Number.parseInt(chunkMatch[2], 10)
      const group = grouped.get(base) ?? { chunks: [] }
      group.chunks.push({ index, value })
      grouped.set(base, group)
      return
    }

    const group = grouped.get(name) ?? { chunks: [] }
    group.base = value
    grouped.set(name, group)
  })

  for (const group of Array.from(grouped.values())) {
    if (group.chunks.length > 0) {
      const joined = group.chunks
        .sort((a: { index: number; value: string }, b: { index: number; value: string }) => a.index - b.index)
        .map((c: { index: number; value: string }) => c.value)
        .join('')
      if (joined) return joined
    }
    if (group.base) return group.base
  }

  return undefined
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

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
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    let effectiveUser = user
    let effectiveError = error
    let hydratedFromCookie = false

    if (!effectiveUser && error?.message?.toLowerCase().includes('session missing')) {
      const tokens = parseSessionTokens(getAuthCookieValue(req.cookies.getAll()))

      if (tokens) {
        hydratedFromCookie = true
        await supabase.auth.setSession(tokens)
        const retry = await supabase.auth.getUser()
        effectiveUser = retry.data.user ?? null
        effectiveError = retry.error

        if (!effectiveUser) {
          const direct = await supabase.auth.getUser(tokens.access_token)
          effectiveUser = direct.data.user ?? null
          effectiveError = direct.error
        }
      }
    }

    const response = NextResponse.json({
      authenticated: Boolean(effectiveUser),
      user_id: effectiveUser?.id ?? null,
      email: effectiveUser?.email ?? null,
      auth_error: effectiveError?.message ?? null,
      hydrated_from_cookie: hydratedFromCookie,
      request_cookie_names: req.cookies.getAll().map((c) => c.name),
      pending_set_cookie_names: pendingCookies.map((c) => c.name),
      now: new Date().toISOString(),
    })

    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (err: any) {
    return NextResponse.json(
      {
        authenticated: false,
        error: err?.message ?? 'Session debug failed',
      },
      { status: 500 }
    )
  }
}
