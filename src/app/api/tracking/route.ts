import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevAuthBypassEnabled, resolveEffectiveUser } from '@/lib/auth/devBypass'
import { UpdateDonorLocationPayload } from '@/types'

// POST /api/tracking – donor pushes new location
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: UpdateDonorLocationPayload = await req.json()

    if (!body.donor_id || !body.request_id || !body.latitude || !body.longitude) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify user owns this donor profile
    let donorQuery = supabase
      .from('donors')
      .select('id, user_id')
      .eq('id', body.donor_id)

    if (!isDevAuthBypassEnabled()) {
      donorQuery = donorQuery.eq('user_id', effectiveUser.id)
    }

    const { data: donor } = await donorQuery.single()

    if (!donor) {
      return NextResponse.json({ error: 'Donor not found or unauthorized' }, { status: 403 })
    }

    // Insert location
    const { data, error } = await supabase
      .from('donor_locations')
      .insert({
        donor_id: body.donor_id,
        request_id: body.request_id,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy,
        speed_kmh: body.speed_kmh,
        heading: body.heading,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Also update donor's current location in donors table
    await supabase
      .from('donors')
      .update({ latitude: body.latitude, longitude: body.longitude })
      .eq('id', body.donor_id)

    return NextResponse.json({ location: data })
  } catch (err: any) {
    console.error('[POST /api/tracking]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/tracking?request_id=xxx – get latest donor location
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('request_id')

    if (!requestId) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })

    const { data, error } = await supabase
      .from('donor_locations')
      .select('*')
      .eq('request_id', requestId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({ location: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
