import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveEffectiveUser } from '@/lib/auth/devBypass'
import { CreateRequestPayload } from '@/types'
import { createInMemoryRequest, listInMemoryRequests } from '@/lib/dev/inMemoryRequests'
import { applyRequestEscalation } from '@/lib/requestEscalation'
import { mapRequestStatusForClient, toAppStatus, toDbStatusList } from '@/lib/requestStatus'

function isMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? '').toLowerCase()
  return (
    msg.includes(`could not find the table 'public.${table}'`) ||
    msg.includes(`relation \"${table}\" does not exist`) ||
    err?.code === 'PGRST205' ||
    err?.code === '42P01'
  )
}

async function insertNotificationsSafe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<Record<string, unknown>>
) {
  if (!rows.length) return
  const { error } = await supabase.from('notifications').insert(rows)
  if (error && !isMissingTableError(error, 'notifications')) {
    console.warn('[POST /api/requests] Notification insert skipped:', error.message)
  }
}

function urgencyWindowText(urgency: 'emergency' | 'priority' | 'normal' | undefined) {
  if (urgency === 'emergency') return 'within 4 hours'
  if (urgency === 'priority') return 'within 12 hours'
  return 'within 24-48 hours'
}

// POST /api/requests – create a new blood request
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: CreateRequestPayload = await req.json()

    // Validate required fields for patient-first workflow
    const required = ['blood_group', 'patient_name', 'age', 'gender', 'medical_reason', 'hospital_name', 'hospital_address', 'requester_lat', 'requester_lng', 'units_needed']
    for (const field of required) {
      if (!(body as any)[field]) {
        return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 })
      }
    }

    const normalizedPatientName = body.patient_name.trim()
    const normalizedAge = Number(body.age)
    const normalizedGender = String(body.gender || '').trim().toLowerCase()
    const normalizedReason = String(body.medical_reason || '').trim().toLowerCase()
    if (!normalizedPatientName) {
      return NextResponse.json({ error: 'Missing field: patient_name' }, { status: 400 })
    }
    if (!Number.isFinite(normalizedAge) || normalizedAge <= 0 || normalizedAge > 120) {
      return NextResponse.json({ error: 'Invalid field: age' }, { status: 400 })
    }
    if (!['male', 'female', 'other'].includes(normalizedGender)) {
      return NextResponse.json({ error: 'Invalid field: gender' }, { status: 400 })
    }
    if (!['surgery', 'accident', 'delivery', 'thalassemia', 'other'].includes(normalizedReason)) {
      return NextResponse.json({ error: 'Invalid field: medical_reason' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', effectiveUser.id)
      .maybeSingle()

    const requesterAddress = body.hospital_address?.trim() || 'Location shared by requester'
    const requestHospitalName = body.hospital_name?.trim() || 'Nearest hospital (auto-detected)'
    const requestHospitalLat = body.hospital_lat ?? body.requester_lat
    const requestHospitalLng = body.hospital_lng ?? body.requester_lng
    const requestContact = body.doctor_contact?.trim() || body.contact_number?.trim() || profile?.phone || 'Not provided'
    const reasonLabel = normalizedReason.charAt(0).toUpperCase() + normalizedReason.slice(1)
    const patientSummary = `Patient Details: Name ${normalizedPatientName}, Age ${normalizedAge}, Gender ${normalizedGender}`
    const medicalSummary = `Medical Context: Reason ${reasonLabel}${body.doctor_contact?.trim() ? `, Doctor Contact ${body.doctor_contact.trim()}` : ''}`
    const combinedNotes = [patientSummary, medicalSummary, body.notes?.trim()].filter(Boolean).join('\n')

    const { data: request, error } = await supabase
      .from('blood_requests')
      .insert({
        requester_id: effectiveUser.id,
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

    if (error) {
      if (!isMissingTableError(error, 'blood_requests')) throw error

      const fallbackRequest = createInMemoryRequest({
        requester_id: effectiveUser.id,
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
        status: 'pending',
        notes: combinedNotes || null,
        accepted_donor_id: null,
        vehicle_booking_id: null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      return NextResponse.json({ request: mapRequestStatusForClient(fallbackRequest), temporary: true }, { status: 201 })
    }

    // Notify only donors with matching blood group and availability.
    const { data: matchingDonors, count, error: matchingErr } = await supabase
      .from('donors')
      .select('id, user_id', { count: 'exact' })
      .eq('blood_group', body.blood_group)
      .eq('is_available', true)

    if (matchingErr && !isMissingTableError(matchingErr, 'donors')) {
      throw matchingErr
    }

    if (matchingDonors && matchingDonors.length > 0) {
      const deadlineText = urgencyWindowText(body.urgency)
      const notifications = matchingDonors
        .filter((d) => d.user_id !== effectiveUser.id)
        .map((d) => ({
          user_id: d.user_id,
          title: `Emergency ${body.blood_group} request`,
          body: `Emergency ${body.blood_group} request at ${requestHospitalName}. ${body.units_needed ?? 1} unit(s) needed ${deadlineText}.`,
          type: 'blood_request',
          data: {
            request_id: request.id,
            blood_group: body.blood_group,
            units_needed: body.units_needed ?? 1,
            urgency: body.urgency ?? 'priority',
            hospital_name: requestHospitalName,
            deadline_text: deadlineText,
          },
        }))

      await insertNotificationsSafe(supabase, notifications)
    }

    if ((count ?? 0) > 0) {
      await supabase
        .from('blood_requests')
        .update({ status: 'matched' })
        .eq('id', request.id)

      await insertNotificationsSafe(supabase, [
        {
          user_id: effectiveUser.id,
          title: 'Donor matches found for your request',
          body: `We found matching ${body.blood_group} donors for ${requestHospitalName}. Waiting for a donor to accept.`,
          type: 'blood_request',
          data: { request_id: request.id, status: 'matched' },
        },
      ])
    } else {
      await insertNotificationsSafe(supabase, [
        {
          user_id: effectiveUser.id,
          title: 'Request sent - waiting for donors',
          body: `Your ${body.blood_group} SOS request is live. We are waiting for nearby donors to accept.`,
          type: 'blood_request',
          data: { request_id: request.id, status: 'pending' },
        },
      ])
    }

    const clientStatus = (count ?? 0) > 0 ? 'matched' : 'pending'
    return NextResponse.json({ request: { ...request, status: toAppStatus(clientStatus) } }, { status: 201 })
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
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') ?? 'requested,matched'
    const bloodGroup = searchParams.get('blood_group')

    let query = supabase
      .from('blood_requests')
      .select(`*, requester:profiles!requester_id(full_name, phone, email)`)
      .in('status', toDbStatusList(status))
      .order('created_at', { ascending: false })
      .limit(50)

    if (bloodGroup) query = query.eq('blood_group', bloodGroup)

    const { data, error } = await query
    if (error) {
      if (!isMissingTableError(error, 'blood_requests')) throw error
      const fallback = listInMemoryRequests({
        statuses: toDbStatusList(status),
        blood_group: bloodGroup ?? undefined,
      })
      return NextResponse.json({ requests: fallback.map(mapRequestStatusForClient), temporary: true })
    }

    const requests = ((data as any[]) ?? []).map(mapRequestStatusForClient)
    await Promise.all(requests.map((r) => applyRequestEscalation(supabase, r as any)))

    return NextResponse.json({ requests })
  } catch (err: any) {
    console.error('[GET /api/requests]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
