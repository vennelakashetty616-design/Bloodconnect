import { RequestStatus } from '@/types'

type InMemoryBloodRequest = {
  id: string
  requester_id: string
  blood_group: string
  hospital_name: string
  hospital_address: string
  hospital_lat: number
  hospital_lng: number
  requester_lat: number
  requester_lng: number
  contact_number: string
  units_needed: number
  urgency: 'emergency' | 'priority' | 'normal'
  status: RequestStatus
  notes: string | null
  accepted_donor_id?: string | null
  vehicle_booking_id?: string | null
  created_at: string
  updated_at: string
  expires_at: string
}

type RequestStore = {
  items: InMemoryBloodRequest[]
}

declare global {
  // eslint-disable-next-line no-var
  var __fuellifeRequestStore: RequestStore | undefined
}

function getStore(): RequestStore {
  if (!globalThis.__fuellifeRequestStore) {
    globalThis.__fuellifeRequestStore = { items: [] }
  }
  return globalThis.__fuellifeRequestStore
}

export function createInMemoryRequest(
  input: Omit<InMemoryBloodRequest, 'id' | 'created_at' | 'updated_at'>
): InMemoryBloodRequest {
  const now = new Date().toISOString()
  const request: InMemoryBloodRequest = {
    ...input,
    id: `tmp-${crypto.randomUUID()}`,
    created_at: now,
    updated_at: now,
  }
  getStore().items.unshift(request)
  return request
}

export function listInMemoryRequests(filters?: { statuses?: string[]; blood_group?: string }) {
  const statuses = filters?.statuses && filters.statuses.length > 0 ? filters.statuses : null
  const bloodGroup = filters?.blood_group ?? null

  return getStore().items
    .filter((r) => (statuses ? statuses.includes(r.status) : true))
    .filter((r) => (bloodGroup ? r.blood_group === bloodGroup : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export function getInMemoryRequestById(id: string) {
  return getStore().items.find((r) => r.id === id) ?? null
}

export function updateInMemoryRequest(id: string, updates: Partial<InMemoryBloodRequest>) {
  const store = getStore()
  const index = store.items.findIndex((r) => r.id === id)
  if (index < 0) return null

  store.items[index] = {
    ...store.items[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }

  return store.items[index]
}
