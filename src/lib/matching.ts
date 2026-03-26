import { BloodGroup, COMPATIBLE_BLOOD_GROUPS, DonorMatch, MIN_DAYS_BETWEEN_DONATIONS } from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

// ─── Haversine Formula ─────────────────────────────────────────────────────
// Returns distance in kilometers between two GPS coordinates
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371 // Earth radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

// ─── ETA Estimation ────────────────────────────────────────────────────────
// Assumes average city speed of 30 km/h + 3 min buffer for start
export function estimateMinutes(distanceKm: number, speedKmh = 30): number {
  const travelMins = (distanceKm / speedKmh) * 60
  return Math.ceil(travelMins + 3) // +3 min startup buffer
}

// ─── Blood Group Compatibility ─────────────────────────────────────────────
export function getCompatibleDonorGroups(recipientGroup: BloodGroup): BloodGroup[] {
  return COMPATIBLE_BLOOD_GROUPS[recipientGroup] ?? [recipientGroup]
}

// ─── Donor Eligibility Check ──────────────────────────────────────────────
export function isDonorEligible(lastDonationDate: string | null): boolean {
  if (!lastDonationDate) return true
  const daysSince = differenceInDays(new Date(), parseISO(lastDonationDate))
  return daysSince >= MIN_DAYS_BETWEEN_DONATIONS
}

// ─── Trust Score Calculation ──────────────────────────────────────────────
// scoring: donations (40%), response rate (30%), recency (30%)
export function calculateTrustScore(
  totalDonations: number,
  responseRate: number,
  lastDonationDate: string | null
): number {
  const donationScore = Math.min(totalDonations * 4, 40) // max 40 pts
  const responseScore = responseRate * 30                 // max 30 pts
  let recencyScore = 15                                   // neutral
  if (lastDonationDate) {
    const days = differenceInDays(new Date(), parseISO(lastDonationDate))
    if (days <= 180) recencyScore = 30
    else if (days <= 365) recencyScore = 20
    else recencyScore = 10
  }
  return Math.min(Math.round(donationScore + responseScore + recencyScore), 100)
}

// ─── Client-side Matching (fallback) ──────────────────────────────────────
// Used when PostGIS function is unavailable; sorts a pre-fetched donor list
export function rankDonors(
  donors: DonorMatch[],
  hospitalLat: number,
  hospitalLng: number,
  radiusKm: number,
  requiredBloodGroup: BloodGroup
): DonorMatch[] {
  const compatible = getCompatibleDonorGroups(requiredBloodGroup)

  return donors
    .filter((d) => {
      if (!compatible.includes(d.blood_group as BloodGroup)) return false
      if (!d.is_available) return false
      if (!isDonorEligible(d.last_donation_date)) return false
      const dist = haversineDistance(d.latitude, d.longitude, hospitalLat, hospitalLng)
      return dist <= radiusKm
    })
    .map((d) => ({
      ...d,
      distance_km: parseFloat(
        haversineDistance(d.latitude, d.longitude, hospitalLat, hospitalLng).toFixed(2)
      ),
      estimated_minutes: estimateMinutes(
        haversineDistance(d.latitude, d.longitude, hospitalLat, hospitalLng)
      ),
    }))
    .sort((a, b) => {
      // Primary: distance; secondary: trust score (desc)
      if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km
      return b.trust_score - a.trust_score
    })
}

// ─── Bearing (for directional arrow on map) ───────────────────────────────
export function getBearing(
  startLat: number, startLng: number,
  endLat: number, endLng: number
): number {
  const dLon = toRad(endLng - startLng)
  const y = Math.sin(dLon) * Math.cos(toRad(endLat))
  const x =
    Math.cos(toRad(startLat)) * Math.sin(toRad(endLat)) -
    Math.sin(toRad(startLat)) * Math.cos(toRad(endLat)) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// ─── Progress percentage ──────────────────────────────────────────────────
export function getTravelProgress(
  initialDistanceKm: number,
  currentDistanceKm: number
): number {
  if (initialDistanceKm <= 0) return 100
  const progress = ((initialDistanceKm - currentDistanceKm) / initialDistanceKm) * 100
  return Math.max(0, Math.min(100, Math.round(progress)))
}

// ─── Heartbeat BPM based on distance ──────────────────────────────────────
// Starts at 60 BPM (far), reaches 140 BPM (at hospital)
export function getHeartbeatBPM(distanceKm: number, maxDistanceKm: number = 10): number {
  const proximity = Math.max(0, 1 - distanceKm / maxDistanceKm)
  return Math.round(60 + proximity * 80) // 60–140 BPM
}

// ─── Format distance/time for UI ─────────────────────────────────────────
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function formatETA(minutes: number): string {
  if (minutes < 1) return 'Arriving now'
  if (minutes === 1) return '1 min away'
  if (minutes < 60) return `${minutes} mins away`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m away`
}
