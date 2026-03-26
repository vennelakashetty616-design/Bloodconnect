// ─── Database Row Types ────────────────────────────────────────────────────

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'

export type RequestStatus =
  | 'requested'            // new workflow: request created and searching
  | 'donor_committed'      // donor accepted/committed
  | 'en_route'             // donor traveling
  | 'donation_in_progress' // donor arrived and donation started
  | 'completed'            // donation done
  | 'cancelled'            // cancelled or expired

  // Legacy compatibility values still returned by some storage paths
  | 'pending'       // waiting for donors
  | 'matched'       // donors notified
  | 'accepted'      // a donor accepted
  | 'in_transit'    // donor travelling
  | 'arrived'       // donor at hospital
  | 'completed'
  | 'cancelled'

export type VehicleType = 'bike' | 'cab'
export type VehicleStatus = 'available' | 'dispatched' | 'arrived'

export type UserRole = 'donor' | 'requester' | 'both'

// ─── Supabase Tables ──────────────────────────────────────────────────────

export interface Profile {
  id: string                    // maps to auth.users.id
  full_name: string
  phone: string
  email: string
  role: UserRole
  date_of_birth?: string | null
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
  weight_kg?: number | null
  city?: string | null
  pincode?: string | null
  basic_profile_setup_completed?: boolean
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Donor {
  id: string                    // uuid primary key
  user_id: string               // fk → profiles.id
  blood_group: BloodGroup
  last_donation_date: string | null
  is_available: boolean
  latitude: number | null
  longitude: number | null
  trust_score: number           // 0–100
  total_donations: number
  response_rate: number         // 0–1 decimal
  response_history: ResponseRecord[]
  created_at: string
  // joined
  profile?: Profile
}

export interface ResponseRecord {
  request_id: string
  responded_at: string
  accepted: boolean
  arrived: boolean
}

export interface BloodRequest {
  id: string
  requester_id: string          // fk → profiles.id
  blood_group: BloodGroup
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
  notes?: string
  accepted_donor_id?: string    // fk → donors.id
  vehicle_booking_id?: string   // fk → vehicle_bookings.id
  created_at: string
  updated_at: string
  expires_at: string
  // joined
  requester?: Profile
  accepted_donor?: Donor
  vehicle_booking?: VehicleBooking
}

export interface DonorMatch {
  donor_id: string
  user_id: string
  full_name: string
  blood_group: BloodGroup
  distance_km: number
  estimated_minutes: number
  trust_score: number
  total_donations: number
  last_donation_date: string | null
  is_available: boolean
  latitude: number
  longitude: number
  phone: string
}

export interface DonorLocation {
  id: string
  donor_id: string
  request_id: string
  latitude: number
  longitude: number
  accuracy?: number
  speed_kmh?: number
  heading?: number
  timestamp: string
}

export interface VehicleBooking {
  id: string
  request_id: string
  donor_id: string
  vehicle_type: VehicleType
  driver_name: string
  driver_phone: string
  vehicle_number: string
  driver_lat: number
  driver_lng: number
  status: VehicleStatus
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  booked_at: string
  picked_up_at?: string
  arrived_at?: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  type: 'blood_request' | 'donor_accepted' | 'in_transit' | 'arrived' | 'completed' | 'emergency'
  data?: Record<string, unknown>
  is_read: boolean
  created_at: string
}

// ─── API Payloads ─────────────────────────────────────────────────────────

export interface CreateRequestPayload {
  blood_group: BloodGroup
  patient_name: string
  age: number
  gender: 'male' | 'female' | 'other'
  medical_reason: 'surgery' | 'accident' | 'delivery' | 'thalassemia' | 'other'
  hospital_name?: string
  hospital_address?: string
  hospital_lat?: number
  hospital_lng?: number
  requester_lat: number
  requester_lng: number
  doctor_contact?: string
  contact_number?: string
  units_needed: number
  urgency?: 'emergency' | 'priority' | 'normal'
  notes?: string
}

export interface UpdateDonorLocationPayload {
  donor_id: string
  request_id: string
  latitude: number
  longitude: number
  accuracy?: number
  speed_kmh?: number
  heading?: number
}

export interface BookVehiclePayload {
  request_id: string
  donor_id: string
  vehicle_type: VehicleType
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
}

// ─── Map / Tracking ───────────────────────────────────────────────────────

export interface LatLng {
  lat: number
  lng: number
}

export interface TrackingState {
  donor_location: LatLng | null
  hospital_location: LatLng
  distance_remaining_km: number
  eta_minutes: number
  last_updated: string
  status: RequestStatus
  vehicle?: VehicleBooking | null
}

// ─── Eligibility ─────────────────────────────────────────────────────────

export const COMPATIBLE_BLOOD_GROUPS: Record<BloodGroup, BloodGroup[]> = {
  'A+':  ['A+', 'A-', 'O+', 'O-'],
  'A-':  ['A-', 'O-'],
  'B+':  ['B+', 'B-', 'O+', 'O-'],
  'B-':  ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],  // universal recipient
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+':  ['O+', 'O-'],
  'O-':  ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],  // universal donor
}

export const MIN_DAYS_BETWEEN_DONATIONS = 56 // 8 weeks

export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export const URGENCY_COLORS = {
  emergency: 'bg-red-600',
  priority: 'bg-amber-500',
  normal: 'bg-green-600',
} as const

export const STATUS_LABELS: Record<RequestStatus, string> = {
  requested: 'Searching for Donors',
  donor_committed: 'Donor Committed',
  en_route: 'Donor En Route',
  donation_in_progress: 'Donation In Progress',
  completed: 'Donation Complete',
  cancelled: 'Cancelled',

  pending: 'Finding Donors...',
  matched: 'Donors Notified',
  accepted: 'Donor Accepted',
  in_transit: 'Donor On The Way',
  arrived: 'Donor Arrived',
  completed: 'Donation Complete',
  cancelled: 'Cancelled',
}
