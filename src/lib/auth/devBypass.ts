import { createAdminClient } from '@/lib/supabase/server'

type MinimalUser = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export function isDevAuthBypassEnabled() {
  return process.env.NODE_ENV !== 'production' && (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ?? 'true') === 'true'
}

export async function resolveEffectiveUser(user: MinimalUser | null | undefined): Promise<MinimalUser | null> {
  if (user) return user
  if (!isDevAuthBypassEnabled()) return null

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (!error && data?.id) {
      const { data: authUserData } = await admin.auth.admin.getUserById(data.id)
      return {
        id: data.id,
        email: data.email ?? null,
        user_metadata: {
          ...(authUserData?.user?.user_metadata ?? {}),
          full_name:
            (authUserData?.user?.user_metadata?.full_name as string | undefined) ??
            data.full_name ??
            'Dev User',
          dev_auth_bypass: true,
        },
      }
    }

    const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    const firstUser = usersData?.users?.[0]
    if (usersErr || !firstUser?.id) return null

    return {
      id: firstUser.id,
      email: firstUser.email ?? null,
      user_metadata: {
        full_name: (firstUser.user_metadata?.full_name as string | undefined) ?? 'Dev User',
        dev_auth_bypass: true,
      },
    }
  } catch {
    return null
  }
}
