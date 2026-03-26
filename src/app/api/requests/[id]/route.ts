import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/requests/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('blood_requests')
      .select(`
        *,
        requester:profiles!requester_id(full_name, phone, email, avatar_url),
        accepted_donor:donors!accepted_donor_id(
          *,
          profile:profiles!user_id(full_name, phone, avatar_url)
        ),
        vehicle_booking:vehicle_bookings(*)
      `)
      .eq('id', params.id)
      .single()

    if (error) throw error
    return NextResponse.json({ request: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/requests/[id] – update status, accept donor, etc.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const allowedFields = ['status', 'accepted_donor_id', 'vehicle_booking_id', 'notes', 'units_needed']
    const updates: Record<string, unknown> = {}
    for (const f of allowedFields) {
      if (f in body) updates[f] = body[f]
    }

    if ('units_needed' in updates) {
      const unitsNeeded = Number(updates.units_needed)
      if (!Number.isInteger(unitsNeeded) || unitsNeeded < 1 || unitsNeeded > 10) {
        return NextResponse.json({ error: 'units_needed must be an integer between 1 and 10' }, { status: 400 })
      }
      updates.units_needed = unitsNeeded
    }

    let query = supabase
      .from('blood_requests')
      .update(updates)
      .eq('id', params.id)

    // Only requester can change required units.
    if ('units_needed' in updates) {
      query = query.eq('requester_id', user.id)
    }

    const { data, error } = await query.select().single()

    if (error) throw error

    // Notify requester via notifications table
    if (body.status === 'accepted' && body.accepted_donor_id) {
      const { data: reqData } = await supabase
        .from('blood_requests')
        .select('requester_id')
        .eq('id', params.id)
        .single()

      if (reqData) {
        await supabase.from('notifications').insert({
          user_id: reqData.requester_id,
          title: '🦸 A Hero Accepted Your Request!',
          body: 'A donor has accepted your blood request and is on their way.',
          type: 'donor_accepted',
          data: { request_id: params.id },
        })
      }
    }

    if (body.status === 'in_transit') {
      const { data: reqData } = await supabase
        .from('blood_requests')
        .select('requester_id')
        .eq('id', params.id)
        .single()

      if (reqData) {
        await supabase.from('notifications').insert({
          user_id: reqData.requester_id,
          title: '🚗 Your Donor Is On The Way',
          body: 'Your blood donor has started travelling to the hospital.',
          type: 'in_transit',
          data: { request_id: params.id },
        })
      }
    }

    return NextResponse.json({ request: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/requests/[id] – cancel request
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('blood_requests')
      .update({ status: 'cancelled' })
      .eq('id', params.id)
      .eq('requester_id', user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
