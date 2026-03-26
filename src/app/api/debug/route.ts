import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({
      error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL',
      hasServiceRoleKey: !!serviceRoleKey,
      hasSuoapbaseUrl: !!supabaseUrl,
    })
  }

  try {
    const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get list of users (admin only)
    const { data: users, error: usersError } = await admin.auth.admin.listUsers()

    if (usersError) {
      return NextResponse.json({ error: usersError.message, code: usersError.statusCode })
    }

    return NextResponse.json({
      totalUsers: users?.users?.length ?? 0,
      users: users?.users?.map((u) => ({
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
        created_at: u.created_at,
      })) ?? [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message })
  }
}
