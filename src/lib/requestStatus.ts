import type { RequestStatus } from '@/types'

const APP_TO_DB_STATUS: Record<string, string> = {
  requested: 'pending',
  donor_committed: 'accepted',
  en_route: 'in_transit',
  donation_in_progress: 'arrived',
  completed: 'completed',
  cancelled: 'cancelled',

  pending: 'pending',
  matched: 'matched',
  accepted: 'accepted',
  in_transit: 'in_transit',
  arrived: 'arrived',
}

const DB_TO_APP_STATUS: Record<string, RequestStatus> = {
  pending: 'requested',
  matched: 'requested',
  accepted: 'donor_committed',
  in_transit: 'en_route',
  arrived: 'donation_in_progress',
  completed: 'completed',
  cancelled: 'cancelled',

  requested: 'requested',
  donor_committed: 'donor_committed',
  en_route: 'en_route',
  donation_in_progress: 'donation_in_progress',
}

export function toDbStatus(status?: string | null) {
  if (!status) return undefined
  const key = String(status).trim().toLowerCase()
  return APP_TO_DB_STATUS[key] ?? key
}

export function toAppStatus(status?: string | null): RequestStatus {
  if (!status) return 'requested'
  const key = String(status).trim().toLowerCase()
  return DB_TO_APP_STATUS[key] ?? 'requested'
}

export function toDbStatusList(csv: string) {
  return csv
    .split(',')
    .map((s) => toDbStatus(s))
    .filter((s): s is string => Boolean(s))
}

export function mapRequestStatusForClient<T extends { status?: string | null }>(request: T): T {
  return {
    ...request,
    status: toAppStatus(request.status),
  }
}
