import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveEffectiveUser } from '@/lib/auth/devBypass'
import { createAdminClient } from '@/lib/supabase/server'
import { getInMemoryRequestById, updateInMemoryRequest } from '@/lib/dev/inMemoryRequests'
import { applyRequestEscalation } from '@/lib/requestEscalation'
import { mapRequestStatusForClient, toDbStatus, toAppStatus } from '@/lib/requestStatus'

function isMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? '').toLowerCase()
  return (
    msg.includes(`could not find the table 'public.${table}'`) ||
    msg.includes(`relation \"${table}\" does not exist`) ||
    err?.code === 'PGRST205' ||
    err?.code === '42P01'
  )
}

async function resolveActorBloodGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  effectiveUser: { id: string; user_metadata?: Record<string, unknown> },
  sessionUser: { user_metadata?: Record<string, unknown> } | null
) {
  const { data: donorData, error: donorErr } = await supabase
    .from('donors')
    .select('blood_group')
    .eq('user_id', effectiveUser.id)
    .maybeSingle()

  if (!donorErr && donorData?.blood_group) {
    return donorData.blood_group as string
  }

  if (donorErr && !isMissingTableError(donorErr, 'donors')) {
    throw donorErr
  }

  const sessionMeta = sessionUser?.user_metadata as Record<string, unknown> | undefined
  const sessionSetup = sessionMeta?.basic_profile_setup as Record<string, unknown> | undefined
  if (typeof sessionSetup?.blood_group === 'string' && sessionSetup.blood_group) {
    return sessionSetup.blood_group
  }

  const bypassMeta = effectiveUser.user_metadata as Record<string, unknown> | undefined
  const bypassSetup = bypassMeta?.basic_profile_setup as Record<string, unknown> | undefined
  if (typeof bypassSetup?.blood_group === 'string' && bypassSetup.blood_group) {
    return bypassSetup.blood_group
  }

  try {
    const admin = createAdminClient()
    const { data: authUserData } = await admin.auth.admin.getUserById(effectiveUser.id)
    const authMeta = authUserData?.user?.user_metadata as Record<string, unknown> | undefined
    const authSetup = authMeta?.basic_profile_setup as Record<string, unknown> | undefined
    if (typeof authSetup?.blood_group === 'string' && authSetup.blood_group) {
      return authSetup.blood_group
    }
  } catch {
    // Ignore metadata fallback failures.
  }

  return null
}

type EligibilitySnapshot = {
  verifiedId: boolean
  blacklisted: boolean
  trustScore: number
  profileSetupCompleted: boolean
}

async function resolveActorEligibility(
  supabase: Awaited<ReturnType<typeof createClient>>,
  effectiveUser: { id: string; user_metadata?: Record<string, unknown> },
  sessionUser: { user_metadata?: Record<string, unknown> } | null
): Promise<EligibilitySnapshot> {
  let trustScore = 100
  let blacklisted = false

  const { data: donorData, error: donorErr } = await supabase
    .from('donors')
    .select('trust_score')
    .eq('user_id', effectiveUser.id)
    .maybeSingle()

  if (donorErr && !isMissingTableError(donorErr, 'donors')) {
    throw donorErr
  }

  if (typeof donorData?.trust_score === 'number') {
    trustScore = donorData.trust_score
  }

  const mergedMeta: Record<string, unknown> = {
    ...(effectiveUser.user_metadata ?? {}),
    ...(sessionUser?.user_metadata ?? {}),
  }

  try {
    const admin = createAdminClient()
    const { data: authUserData } = await admin.auth.admin.getUserById(effectiveUser.id)
    Object.assign(mergedMeta, authUserData?.user?.user_metadata ?? {})
  } catch {
    // Ignore admin metadata fallback failures.
  }

  if (typeof mergedMeta.trust_score === 'number' && Number.isFinite(mergedMeta.trust_score)) {
    trustScore = mergedMeta.trust_score as number
  }

  blacklisted = Boolean(
    mergedMeta.blacklisted === true ||
    mergedMeta.is_blacklisted === true ||
    mergedMeta.blocked === true
  )

  const profileSetupCompleted = Boolean(mergedMeta.basic_profile_setup_completed === true)

  const verifiedId = Boolean(
    mergedMeta.id_verified === true ||
    mergedMeta.kyc_verified === true ||
    profileSetupCompleted
  )

  return { verifiedId, blacklisted, trustScore, profileSetupCompleted }
}

function getMedicalIneligibilityReason(selfDeclaration: Record<string, unknown> | null | undefined) {
  if (!selfDeclaration) {
    return 'medical self-declaration checklist is incomplete'
  }

  const checks: Array<{ key: string; reason: string }> = [
    { key: 'no_fever_or_infection_7_days', reason: 'fever or infection reported in last 7 days' },
    { key: 'not_on_antibiotics', reason: 'currently on antibiotics' },
    { key: 'no_recent_surgery_6_months', reason: 'recent surgery reported in last 6 months' },
    { key: 'no_tattoo_or_piercing_6_12_months', reason: 'recent tattoo or piercing reported' },
    { key: 'no_recent_malaria_or_dengue', reason: 'recent malaria or dengue reported' },
    { key: 'not_pregnant_or_breastfeeding_if_applicable', reason: 'pregnancy or breastfeeding eligibility issue' },
    { key: 'not_within_cooling_period', reason: 'still within donation cooling period' },
    { key: 'physically_fit_today', reason: 'not feeling physically fit today' },
  ]

  for (const check of checks) {
    if (selfDeclaration[check.key] !== true) {
      return check.reason
    }
  }

  return null
}

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

    if (error) {
      if (!isMissingTableError(error, 'blood_requests')) throw error
      const fallback = getInMemoryRequestById(params.id)
      if (!fallback) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
      return NextResponse.json({ request: mapRequestStatusForClient(fallback), temporary: true })
    }
    await applyRequestEscalation(supabase, data as any)
    return NextResponse.json({ request: mapRequestStatusForClient(data as any) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/requests/[id] – update status, accept donor, etc.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const allowedFields = ['status', 'accepted_donor_id', 'vehicle_booking_id', 'notes', 'units_needed']
    const updates: Record<string, unknown> = {}
    for (const f of allowedFields) {
      if (f in body) updates[f] = body[f]
    }

    let donorCancelledBackToSearching = false
    const requestedStatusRaw = typeof updates.status === 'string' ? updates.status : undefined
    const normalizedDbStatus = toDbStatus(requestedStatusRaw)
    if (normalizedDbStatus) updates.status = normalizedDbStatus

    if ('units_needed' in updates) {
      const unitsNeeded = Number(updates.units_needed)
      if (!Number.isInteger(unitsNeeded) || unitsNeeded < 1 || unitsNeeded > 10) {
        return NextResponse.json({ error: 'units_needed must be an integer between 1 and 10' }, { status: 400 })
      }
      updates.units_needed = unitsNeeded
    }

    if (normalizedDbStatus === 'accepted') {
      const { data: requestData, error: requestErr } = await supabase
        .from('blood_requests')
        .select('id, blood_group')
        .eq('id', params.id)
        .single()

      if (requestErr && !isMissingTableError(requestErr, 'blood_requests')) {
        throw requestErr
      }

      const fallbackRequest = !requestData ? getInMemoryRequestById(params.id) : null
      const targetBloodGroup = requestData?.blood_group ?? fallbackRequest?.blood_group

      if (!targetBloodGroup) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
      }

      const actorBloodGroup = await resolveActorBloodGroup(supabase, effectiveUser, user)
      if (!actorBloodGroup) {
        return NextResponse.json({ error: 'Set your blood group in profile setup before accepting requests' }, { status: 400 })
      }

      if (actorBloodGroup !== targetBloodGroup) {
        return NextResponse.json({ error: `Only ${targetBloodGroup} donors can accept this request` }, { status: 403 })
      }

      const eligibility = await resolveActorEligibility(supabase, effectiveUser, user)
      if (!eligibility.profileSetupCompleted) {
        return NextResponse.json({ error: 'Please update your profile before accepting requests' }, { status: 403 })
      }
      if (!eligibility.verifiedId) {
        return NextResponse.json({ error: 'not eligiable because of unverified ID' }, { status: 403 })
      }
      if (eligibility.blacklisted) {
        return NextResponse.json({ error: 'not eligiable because of blacklist status' }, { status: 403 })
      }

      const minTrustThresholdRaw = process.env.DONOR_TRUST_MIN_SCORE
      const minTrustThreshold = Number.parseFloat(minTrustThresholdRaw ?? '')
      if (Number.isFinite(minTrustThreshold) && eligibility.trustScore < minTrustThreshold) {
        return NextResponse.json(
          { error: `not eligiable because of trust score below threshold (${eligibility.trustScore} < ${minTrustThreshold})` },
          { status: 403 }
        )
      }

      const medicalReason = getMedicalIneligibilityReason(
        (body.self_declaration as Record<string, unknown> | undefined) ?? undefined
      )
      if (medicalReason) {
        return NextResponse.json({ error: `not eligiable because of ${medicalReason}` }, { status: 403 })
      }

      const incomingAcceptedDonorId = body.accepted_donor_id as string | undefined
      if (incomingAcceptedDonorId) {
        const { data: donorData, error: donorErr } = await supabase
          .from('donors')
          .select('id, user_id')
          .eq('id', incomingAcceptedDonorId)
          .single()

        if (donorErr && !isMissingTableError(donorErr, 'donors')) {
          throw donorErr
        }

        if (donorData && donorData.user_id !== effectiveUser.id) {
          return NextResponse.json({ error: 'Only the selected donor can accept this request' }, { status: 403 })
        }

        if (!donorData && !isMissingTableError(donorErr, 'donors')) {
          return NextResponse.json({ error: 'Please update your profile before accepting requests' }, { status: 403 })
        }
      } else {
        const { data: actorDonor, error: actorDonorErr } = await supabase
          .from('donors')
          .select('id')
          .eq('user_id', effectiveUser.id)
          .maybeSingle()

        if (actorDonorErr && !isMissingTableError(actorDonorErr, 'donors')) {
          throw actorDonorErr
        }

        if (!actorDonor && !isMissingTableError(actorDonorErr, 'donors')) {
          return NextResponse.json({ error: 'Please update your profile before accepting requests' }, { status: 403 })
        }

        if (actorDonor?.id) {
          updates.accepted_donor_id = actorDonor.id
        }
      }
    }

    if (normalizedDbStatus === 'cancelled') {
      const { data: existingReq, error: existingErr } = await supabase
        .from('blood_requests')
        .select('requester_id, accepted_donor_id, status')
        .eq('id', params.id)
        .single()

      if (existingErr && !isMissingTableError(existingErr, 'blood_requests')) {
        throw existingErr
      }

      const isRequesterCancelling = existingReq?.requester_id === effectiveUser.id
      const wasCommitted = ['accepted', 'in_transit', 'arrived'].includes(String(existingReq?.status ?? ''))
      if (!isRequesterCancelling && wasCommitted) {
        updates.status = 'pending'
        updates.accepted_donor_id = null
        updates.vehicle_booking_id = null
        donorCancelledBackToSearching = true
      }
    }

    let query = supabase
      .from('blood_requests')
      .update(updates)
      .eq('id', params.id)

    // Only requester can change required units.
    if ('units_needed' in updates) {
      query = query.eq('requester_id', effectiveUser.id)
    }

    const { data, error } = await query.select().single()

    if (error) {
      if (!isMissingTableError(error, 'blood_requests')) throw error
      const updated = updateInMemoryRequest(params.id, updates as Record<string, unknown>)
      if (!updated) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
      return NextResponse.json({ request: mapRequestStatusForClient(updated), temporary: true })
    }

    // Notify requester via notifications table
    const finalDbStatus = toDbStatus(String((data as any)?.status ?? updates.status ?? ''))

    if (finalDbStatus === 'accepted') {
      const { data: reqData } = await supabase
        .from('blood_requests')
        .select('requester_id, accepted_donor_id')
        .eq('id', params.id)
        .single()

      if (reqData) {
        const donorDetails = {
          full_name: (effectiveUser.user_metadata?.full_name as string | undefined) || 'Donor',
          phone: (effectiveUser.user_metadata?.phone as string | undefined) || '',
          trust_score: null as number | null,
        }

        if (reqData.accepted_donor_id) {
          const { data: acceptedDonor } = await supabase
            .from('donors')
            .select('trust_score, profile:profiles!user_id(full_name, phone)')
            .eq('id', reqData.accepted_donor_id)
            .maybeSingle()

          if (acceptedDonor) {
            donorDetails.full_name = (acceptedDonor as any)?.profile?.full_name || donorDetails.full_name
            donorDetails.phone = (acceptedDonor as any)?.profile?.phone || donorDetails.phone
            donorDetails.trust_score = (acceptedDonor as any)?.trust_score ?? donorDetails.trust_score
          }
        }

        await supabase.from('notifications').insert({
          user_id: reqData.requester_id,
          title: '🦸 A Hero Accepted Your Request!',
          body: `A donor has accepted your request. Donor: ${donorDetails.full_name}.`,
          type: 'donor_accepted',
          data: {
            request_id: params.id,
            donor_name: donorDetails.full_name,
            donor_phone: donorDetails.phone,
            donor_trust_score: donorDetails.trust_score,
          },
        })
      }
    }

    if (finalDbStatus === 'in_transit') {
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

    if (donorCancelledBackToSearching) {
      const { data: reqData } = await supabase
        .from('blood_requests')
        .select('requester_id')
        .eq('id', params.id)
        .single()

      if (reqData) {
        await supabase.from('notifications').insert({
          user_id: reqData.requester_id,
          title: 'Donor cancelled. Searching again',
          body: 'The donor cancelled this request. We reverted your request to searching state.',
          type: 'blood_request',
          data: { request_id: params.id, status: 'requested' },
        })
      }
    }

    return NextResponse.json({ request: mapRequestStatusForClient(data as any) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/requests/[id] – cancel request
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('blood_requests')
      .update({ status: 'cancelled' })
      .eq('id', params.id)
      .eq('requester_id', effectiveUser.id)

    if (error) {
      if (!isMissingTableError(error, 'blood_requests')) throw error
      const updated = updateInMemoryRequest(params.id, { status: 'cancelled' })
      if (!updated) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
