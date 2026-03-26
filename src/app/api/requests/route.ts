import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CreateRequestPayload } from '@/types'

// POST /api/requests – create a new blood request
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: CreateRequestPayload = await req.json()

    // Validate required fields for patient-first workflow
    const required = ['blood_group', 'patient_name', 'age', 'gender', 'requester_lat', 'requester_lng', 'units_needed']
    for (const field of required) {
      if (!(body as any)[field]) {
        return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 })
      }
    }

    const normalizedPatientName = body.patient_name.trim()
    const normalizedAge = Number(body.age)
    const normalizedGender = String(body.gender || '').trim().toLowerCase()
    if (!normalizedPatientName) {
      return NextResponse.json({ error: 'Missing field: patient_name' }, { status: 400 })
    }
    if (!Number.isFinite(normalizedAge) || normalizedAge <= 0 || normalizedAge > 120) {
      return NextResponse.json({ error: 'Invalid field: age' }, { status: 400 })
    }
    if (!['male', 'female', 'other'].includes(normalizedGender)) {
      return NextResponse.json({ error: 'Invalid field: gender' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle()

    const requesterAddress = body.hospital_address?.trim() || 'Location shared by requester'
    const requestHospitalName = body.hospital_name?.trim() || `Patient: ${normalizedPatientName}`
    const requestHospitalLat = body.hospital_lat ?? body.requester_lat
    const requestHospitalLng = body.hospital_lng ?? body.requester_lng
    const requestContact = body.contact_number?.trim() || profile?.phone || 'Not provided'
    const patientSummary = `Patient Details: Name ${normalizedPatientName}, Age ${normalizedAge}, Gender ${normalizedGender}`
    const combinedNotes = [patientSummary, body.notes?.trim()].filter(Boolean).join('\n')

    const { data: request, error } = await supabase
      .from('blood_requests')
      .insert({
        requester_id: user.id,
        blood_group: body.blood_group,
        hospital_name: requestHospitalName,
        hospital_address: requesterAddress,
        hospital_lat: requestHospitalLat,
        hospital_lng: requestHospitalLng,
        requester_lat: body.requester_lat,
        requester_lng: body.requester_lng,
        contact_number: requestContact,
        units_needed: body.units_needed ?? 1,
        urgency: body.urgency ?? 'priority',
        notes: combinedNotes || null,
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Notify only donors with matching blood group and availability.
    const { data: matchingDonors, count } = await supabase
      .from('donors')
      .select('id, user_id', { count: 'exact' })
      .eq('blood_group', body.blood_group)
      .eq('is_available', true)

    if (matchingDonors && matchingDonors.length > 0) {
      const notifications = matchingDonors
        .filter((d) => d.user_id !== user.id)
        .map((d) => ({
          user_id: d.user_id,
          title: `New ${body.blood_group} blood request nearby`,
          body: `${requestHospitalName} needs ${body.units_needed ?? 1} unit(s). Tap to view and accept.`,
          type: 'blood_request',
          data: { request_id: request.id, blood_group: body.blood_group },
        }))

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications)
      }
    }

    if ((count ?? 0) > 0) {
      await supabase
        .from('blood_requests')
        .update({ status: 'matched' })
        .eq('id', request.id)
    }

    return NextResponse.json({ request: { ...request, status: (count ?? 0) > 0 ? 'matched' : 'pending' } }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/requests]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/requests – list requests (for donor view)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') ?? 'pending,matched'
    const bloodGroup = searchParams.get('blood_group')

    let query = supabase
      .from('blood_requests')
      .select(`*, requester:profiles!requester_id(full_name, phone, email)`)
      .in('status', status.split(','))
      .order('created_at', { ascending: false })
      .limit(50)

    if (bloodGroup) query = query.eq('blood_group', bloodGroup)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ requests: data })
  } catch (err: any) {
    console.error('[GET /api/requests]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
