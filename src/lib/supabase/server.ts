import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  for (const group of grouped.values()) {
    if (group.chunks.length > 0) {
      const joined = group.chunks
        .sort((a, b) => a.index - b.index)
        .map((c) => c.value)
        .join('')
      if (joined) return joined
    }
    if (group.base) return group.base
  }

  return undefined
}

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return Boolean(url) && !url.includes('your_') && url.startsWith('https://')
}

export async function createClient() {
  const cookieStore = await cookies()
  const url = isConfigured() ? process.env.NEXT_PUBLIC_SUPABASE_URL! : 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

  const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — ignore
          }
        },
      },
    }
  )

  const tokens = parseSessionTokens(getAuthCookieValue(cookieStore.getAll()))
  if (tokens) {
    await supabase.auth.setSession(tokens)

    // Fallback for environments where getUser() cannot read restored in-memory session.
    const direct = await supabase.auth.getUser(tokens.access_token)
    if (!direct.error && direct.data.user) {
      await supabase.auth.setSession(tokens)
    }
  }

  return supabase
}

// Admin client with service role key (server-side only)
export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
