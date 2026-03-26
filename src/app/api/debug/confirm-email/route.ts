import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({
      error: 'Missing credentials',
      hasServiceRoleKey: !!serviceRoleKey,
      hasSupabaseUrl: !!supabaseUrl,
    }, { status: 500 })
  }

  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Mark user as email confirmed
    const { data, error } = await admin.auth.admin.updateUserById(
      '', // Will be updated after we find the user
      { email_confirm: true }
    )

    // First list users to find the ID
    const { data: users, error: listError } = await admin.auth.admin.listUsers()
    if (listError || !users?.users) {
      return NextResponse.json({ error: listError?.message ?? 'Could not list users' }, { status: 500 })
    }

    const user = users.users.find((u) => u.email === email)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Now confirm the email
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: `Email confirmed for ${email}`,
      userId: user.id,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
