import { createAdminClient } from '@/lib/supabase/server'
import type { BloodRequest } from '@/types'

type SupabaseLike = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

function isMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? '').toLowerCase()
  return (
    msg.includes(`could not find the table 'public.${table}'`) ||
    msg.includes(`relation \"${table}\" does not exist`) ||
    err?.code === 'PGRST205' ||
    err?.code === '42P01'
  )
}

function urgencyWindowHours(urgency?: string) {
  if (urgency === 'emergency') return 4
  if (urgency === 'priority') return 12
  return 24
}

async function hasEscalationNotification(supabase: SupabaseLike, requestId: string, stage: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'emergency')
    .contains('data', { request_id: requestId, escalation_stage: stage })
    .limit(1)

  if (error && !isMissingTableError(error, 'notifications')) {
    console.warn('[requestEscalation] notification lookup skipped:', error.message)
  }

  return Boolean(data && data.length > 0)
}

async function notifyAdmins(supabase: SupabaseLike, request: BloodRequest) {
  let adminIds: string[] = []
  const adminEmails = (process.env.ALERT_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (adminEmails.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', adminEmails)
    adminIds = (data ?? []).map((p: any) => p.id)
  }

  if (adminIds.length === 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .neq('id', request.requester_id)
      .order('created_at', { ascending: true })
      .limit(3)
    adminIds = (data ?? []).map((p: any) => p.id)
  }

  if (adminIds.length === 0) return

  const rows = adminIds.map((id) => ({
    user_id: id,
    title: 'Admin alert: urgent blood request needs intervention',
    body: `${request.blood_group} request at ${request.hospital_name} is still unmatched. Please assist manually.`,
    type: 'emergency',
    data: {
      request_id: request.id,
      escalation_stage: 'admin_alert',
      urgency: request.urgency,
    },
  }))

  const { error } = await supabase.from('notifications').insert(rows)
  if (error && !isMissingTableError(error, 'notifications')) {
    console.warn('[requestEscalation] admin notification skipped:', error.message)
  }
}

export async function applyRequestEscalation(supabase: SupabaseLike, request: BloodRequest) {
  if (!request) return
  if (request.status !== 'pending' && request.status !== 'matched') return

  const createdAt = new Date(request.created_at).getTime()
  if (!Number.isFinite(createdAt)) return

  const elapsedMs = Date.now() - createdAt
  const oneHourMs = 60 * 60 * 1000
  const twoHourMs = 2 * oneHourMs

  const hoursWindow = urgencyWindowHours(request.urgency)
  const countdownMs = Math.max(0, hoursWindow * oneHourMs - elapsedMs)

  if (elapsedMs >= oneHourMs) {
    const alreadyExpanded = await hasEscalationNotification(supabase, request.id, 'radius_expanded')
    if (!alreadyExpanded) {
      const { error: notifyRequesterErr } = await supabase.from('notifications').insert({
        user_id: request.requester_id,
        title: 'Search radius expanded for your SOS request',
        body: `No donor accepted within 1 hour. We expanded the search radius and re-alerted donors.`,
        type: 'emergency',
        data: {
          request_id: request.id,
          escalation_stage: 'radius_expanded',
          expanded_radius_km: 25,
          time_left_minutes: Math.ceil(countdownMs / 60000),
        },
      })

      if (notifyRequesterErr && !isMissingTableError(notifyRequesterErr, 'notifications')) {
        console.warn('[requestEscalation] requester radius alert skipped:', notifyRequesterErr.message)
      }

      const { data: donors, error: donorErr } = await supabase
        .from('donors')
        .select('user_id')
        .eq('blood_group', request.blood_group)
        .eq('is_available', true)

      if (!donorErr && donors && donors.length > 0) {
        const rows = donors
          .filter((d: any) => d.user_id !== request.requester_id)
          .map((d: any) => ({
            user_id: d.user_id,
            title: `Expanded radius ${request.blood_group} emergency request`,
            body: `${request.hospital_name} still needs ${request.units_needed} unit(s). Please respond if available.`,
            type: 'emergency',
            data: {
              request_id: request.id,
              escalation_stage: 'radius_expanded',
              expanded_radius_km: 25,
            },
          }))

        if (rows.length > 0) {
          const { error } = await supabase.from('notifications').insert(rows)
          if (error && !isMissingTableError(error, 'notifications')) {
            console.warn('[requestEscalation] donor radius alert skipped:', error.message)
          }
        }
      }
    }
  }

  if (elapsedMs >= twoHourMs) {
    const alreadyAdminNotified = await hasEscalationNotification(supabase, request.id, 'admin_alert')
    if (!alreadyAdminNotified) {
      await notifyAdmins(supabase, request)
    }
  }
}
