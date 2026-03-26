import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveEffectiveUser } from '@/lib/auth/devBypass'

// GET /api/donors/me – get current user's donor profile
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('donors')
      .select('*, profile:profiles!user_id(*)')
      .eq('user_id', effectiveUser.id)
      .single()

    if (error && error.code === 'PGRST116') {
      return NextResponse.json({ donor: null }) // not registered as donor yet
    }
    if (error) throw error

    return NextResponse.json({ donor: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/donors/me – register / update donor profile
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    const payload = {
      user_id: effectiveUser.id,
      blood_group: body.blood_group,
      last_donation_date: body.last_donation_date ?? null,
      is_available: body.is_available ?? true,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
    }

    const { data, error } = await supabase
      .from('donors')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ donor: data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/donors/me – update availability or location
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const allowed = ['is_available', 'latitude', 'longitude', 'last_donation_date']
    const updates: Record<string, unknown> = {}
    for (const f of allowed) if (f in body) updates[f] = body[f]

    const { data, error } = await supabase
      .from('donors')
      .update(updates)
      .eq('user_id', effectiveUser.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ donor: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
