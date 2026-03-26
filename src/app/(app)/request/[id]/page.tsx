'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import {
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  UserRound,
  XCircle,
  PlusCircle,
  Navigation,
  Bike,
  Car,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '@/components/layout/Navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { BloodGroupBadge } from '@/components/ui/Badge'
import { HeartbeatIcon } from '@/components/ui/HeartbeatIcon'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useRealTimeTracking } from '@/hooks/useTracking'
import { estimateMinutes, haversineDistance } from '@/lib/matching'
import type { BloodRequest, RequestStatus, VehicleType } from '@/types'

const TrackingMap = dynamic(() => import('@/components/map/TrackingMap'), { ssr: false })

type UiStatus = 'searching' | 'found' | 'enroute' | 'completed'
type TransportChoice = VehicleType | 'self'

type RideDraft = {
  pickupLat: number
  pickupLng: number
  dropLat: number
  dropLng: number
  etaToHospitalMin: number
  estimatedCostInr: number
}

type RideBooked = {
  trackingId: string
  vehicleType: VehicleType
  driverName: string
  vehicleNumber: string
  etaToPickupMin: number
  linkedDonorId: string | null
  status: 'to_pickup' | 'to_hospital' | 'completed'
  driverLat: number
  driverLng: number
  pickupLat: number
  pickupLng: number
  dropLat: number
  dropLng: number
}

function getUiStatus(status: RequestStatus): UiStatus {
  if (status === 'completed') return 'completed'
  if (status === 'en_route' || status === 'in_transit' || status === 'arrived' || status === 'donation_in_progress') return 'enroute'
  if (status === 'matched' || status === 'accepted' || status === 'donor_committed') return 'found'
  return 'searching'
}

function statusMeta(status: UiStatus) {
  if (status === 'searching') return { label: 'Searching for Donors', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (status === 'found') return { label: 'Donor Found', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
  if (status === 'enroute') return { label: 'Donor En Route', cls: 'bg-blue-100 text-blue-800 border-blue-200' }
  return { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
}

function formatCountdown(msLeft: number) {
  if (msLeft <= 0) return 'Expired'
  const totalMinutes = Math.floor(msLeft / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m}m`
}

function maskPhone(phone: string) {
  if (!phone) return 'Hidden'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return 'Hidden'
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`
}

function parsePatientName(request: BloodRequest) {
  const hospital = request.hospital_name || ''
  if (hospital.startsWith('Patient:')) {
    return hospital.replace('Patient:', '').trim()
  }
  return 'Patient'
}

function moveToward(current: number, target: number, ratio: number) {
  return current + (target - current) * ratio
}

export default function RequestStatusPage() {
  const params = useParams()
  const id = params.id as string

  const [request, setRequest] = useState<BloodRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [unitsUpdating, setUnitsUpdating] = useState(false)
  const [now, setNow] = useState(Date.now())

  const [transportChoice, setTransportChoice] = useState<TransportChoice | null>(null)
  const [showRideModal, setShowRideModal] = useState(false)
  const [rideDraft, setRideDraft] = useState<RideDraft | null>(null)
  const [rideLoading, setRideLoading] = useState(false)
  const [rideBooked, setRideBooked] = useState<RideBooked | null>(null)

  const rideStatusRef = useRef<RideBooked['status'] | null>(null)

  const { donorLoc, distanceKm, etaMinutes } = useRealTimeTracking(
    request && ['donor_committed', 'accepted', 'en_route', 'in_transit', 'donation_in_progress', 'arrived', 'completed'].includes(request.status) ? id : null,
    request?.hospital_lat ?? 0,
    request?.hospital_lng ?? 0
  )

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!id) return

    let cancelled = false

    async function loadRequest() {
      setLoading(true)
      try {
        const res = await fetch(`/api/requests/${id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load request')
        if (!cancelled) setRequest(json.request as BloodRequest)
      } catch (err: any) {
        if (!cancelled) toast.error(err.message || 'Failed to load request')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRequest()
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`request-status:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'blood_requests', filter: `id=eq.${id}` },
        (payload) => {
          const nextStatus = payload.new.status as RequestStatus
          setRequest((prev) => (prev ? { ...prev, ...payload.new, status: nextStatus } : prev))
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [id])

  useEffect(() => {
    if (!rideBooked) return

    const interval = setInterval(() => {
      setRideBooked((prev) => {
        if (!prev) return prev

        if (prev.status === 'completed') return prev

        if (prev.status === 'to_pickup') {
          const nextLat = moveToward(prev.driverLat, prev.pickupLat, 0.25)
          const nextLng = moveToward(prev.driverLng, prev.pickupLng, 0.25)
          const remainKm = haversineDistance(nextLat, nextLng, prev.pickupLat, prev.pickupLng)
          const etaToPickup = Math.max(1, estimateMinutes(remainKm, prev.vehicleType === 'bike' ? 35 : 25))

          if (remainKm <= 0.12) {
            return {
              ...prev,
              status: 'to_hospital',
              etaToPickupMin: 0,
              driverLat: prev.pickupLat,
              driverLng: prev.pickupLng,
            }
          }

          return {
            ...prev,
            driverLat: nextLat,
            driverLng: nextLng,
            etaToPickupMin: etaToPickup,
          }
        }

        const nextLat = moveToward(prev.driverLat, prev.dropLat, 0.14)
        const nextLng = moveToward(prev.driverLng, prev.dropLng, 0.14)
        const remainKm = haversineDistance(nextLat, nextLng, prev.dropLat, prev.dropLng)

        if (remainKm <= 0.15) {
          return {
            ...prev,
            status: 'completed',
            driverLat: prev.dropLat,
            driverLng: prev.dropLng,
          }
        }

        return {
          ...prev,
          driverLat: nextLat,
          driverLng: nextLng,
        }
      })
    }, 3500)

    return () => clearInterval(interval)
  }, [rideBooked?.trackingId])

  useEffect(() => {
    if (!rideBooked) return
    const prevStatus = rideStatusRef.current
    if (prevStatus !== rideBooked.status) {
      if (rideBooked.status === 'to_hospital') {
        toast.success('Driver reached donor. Ride is now heading to hospital.')
      }
      if (rideBooked.status === 'completed') {
        toast.success('Ride reached hospital successfully.')
      }
    }
    rideStatusRef.current = rideBooked.status
  }, [rideBooked?.status])

  const uiStatus = useMemo(() => (request ? getUiStatus(request.status) : 'searching'), [request])
  const badge = statusMeta(uiStatus)

  const countdown = useMemo(() => {
    if (!request?.expires_at) return 'Unknown'
    return formatCountdown(new Date(request.expires_at).getTime() - now)
  }, [request?.expires_at, now])

  const totalUnits = request?.units_needed ?? 1
  const fulfilledUnits = request && ['donor_committed', 'accepted', 'en_route', 'in_transit', 'donation_in_progress', 'arrived', 'completed'].includes(request.status) ? 1 : 0
  const progressPct = Math.min(100, Math.round((fulfilledUnits / Math.max(1, totalUnits)) * 100))

  const showDonorSection = Boolean(request && ['donor_committed', 'accepted', 'en_route', 'in_transit', 'donation_in_progress', 'arrived', 'completed'].includes(request.status))
  const showMap = Boolean(request && uiStatus !== 'searching')
  const transportEligible = Boolean(request && ['donor_committed', 'accepted', 'en_route', 'in_transit'].includes(request.status))

  const donorName = request?.accepted_donor?.profile?.full_name || 'Assigned donor'
  const donorPhoneRaw = request?.accepted_donor?.profile?.phone || ''
  const donorPhoneMasked = maskPhone(donorPhoneRaw)
  const donorTrust = request?.accepted_donor?.trust_score ?? 0
  const donorVerified = Boolean(request?.accepted_donor)

  const effectiveDonorLoc = donorLoc
  const effectiveDistance = distanceKm
  const effectiveEta = etaMinutes
  const lastUpdatedText = 'Live'

  const donorPickup = useMemo(() => {
    const donorLat = effectiveDonorLoc?.lat ?? request?.accepted_donor?.latitude ?? request?.requester_lat ?? request?.hospital_lat
    const donorLng = effectiveDonorLoc?.lng ?? request?.accepted_donor?.longitude ?? request?.requester_lng ?? request?.hospital_lng
    if (typeof donorLat !== 'number' || typeof donorLng !== 'number') return null
    return { lat: donorLat, lng: donorLng }
  }, [effectiveDonorLoc?.lat, effectiveDonorLoc?.lng, request?.accepted_donor?.latitude, request?.accepted_donor?.longitude, request?.requester_lat, request?.requester_lng, request?.hospital_lat, request?.hospital_lng])

  const donorMarkerForMap = useMemo(() => {
    if (rideBooked && rideBooked.status === 'to_hospital') {
      return { lat: rideBooked.driverLat, lng: rideBooked.driverLng }
    }
    return effectiveDonorLoc
  }, [rideBooked?.status, rideBooked?.driverLat, rideBooked?.driverLng, effectiveDonorLoc?.lat, effectiveDonorLoc?.lng])

  async function cancelRequest() {
    if (!request) return

    try {
      const res = await fetch(`/api/requests/${request.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not cancel request')
      setRequest({ ...request, status: 'cancelled' })
      toast.success('Request cancelled')
    } catch (err: any) {
      toast.error(err.message || 'Could not cancel request')
    }
  }

  async function requestAdditionalUnits() {
    if (!request || unitsUpdating) return
    const nextUnits = Math.min(10, (request.units_needed ?? 1) + 1)

    if (nextUnits === (request.units_needed ?? 1)) {
      toast('Maximum 10 units allowed for a single request')
      return
    }

    setUnitsUpdating(true)
    const prevUnits = request.units_needed ?? 1
    setRequest({ ...request, units_needed: nextUnits })

    try {
      const res = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units_needed: nextUnits }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not update units')
      setRequest((prev) => (prev ? { ...prev, units_needed: json.request?.units_needed ?? nextUnits } : prev))
      toast.success(`Updated to ${json.request?.units_needed ?? nextUnits} units`)
    } catch (err: any) {
      setRequest({ ...request, units_needed: prevUnits })
      toast.error(err.message || 'Could not update units')
    } finally {
      setUnitsUpdating(false)
    }
  }

  function contactDonor() {
    if (!showDonorSection) return
    if (donorPhoneRaw && donorPhoneRaw.startsWith('+')) {
      window.location.href = `tel:${donorPhoneRaw}`
      return
    }
    toast('Contact details are masked for privacy')
  }

  function startArrangeRide() {
    if (!request || !transportEligible) return
    if (!transportChoice) {
      toast('Choose Bike, Cab, or I will manage')
      return
    }

    if (transportChoice === 'self') {
      toast.success('Donor will manage transport independently')
      return
    }

    if (!donorPickup) {
      toast.error('Donor location unavailable right now. Please try again.')
      return
    }

    const distKm = haversineDistance(
      donorPickup.lat,
      donorPickup.lng,
      request.hospital_lat,
      request.hospital_lng
    )

    const eta = estimateMinutes(distKm, transportChoice === 'bike' ? 35 : 25)
    const cost = Math.round(distKm * (transportChoice === 'bike' ? 14 : 22) + (transportChoice === 'bike' ? 25 : 60))

    setRideDraft({
      pickupLat: donorPickup.lat,
      pickupLng: donorPickup.lng,
      dropLat: request.hospital_lat,
      dropLng: request.hospital_lng,
      etaToHospitalMin: eta,
      estimatedCostInr: Math.max(cost, transportChoice === 'bike' ? 45 : 120),
    })
    setShowRideModal(true)
  }

  async function confirmRide() {
    if (!request || !rideDraft || !transportChoice || transportChoice === 'self') return
    if (!request.accepted_donor_id) {
      toast.error('Cannot arrange ride until a donor is assigned.')
      return
    }
    setRideLoading(true)

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: request.id,
          donor_id: request.accepted_donor_id,
          vehicle_type: transportChoice,
          pickup_address: 'Donor live location',
          pickup_lat: rideDraft.pickupLat,
          pickup_lng: rideDraft.pickupLng,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Ride booking failed')

      const booking = json.booking
      setRideBooked({
        trackingId: booking.id,
        vehicleType: booking.vehicle_type,
        driverName: booking.driver_name,
        vehicleNumber: booking.vehicle_number,
        etaToPickupMin: estimateMinutes(
          haversineDistance(booking.driver_lat, booking.driver_lng, rideDraft.pickupLat, rideDraft.pickupLng),
          transportChoice === 'bike' ? 35 : 25
        ),
        linkedDonorId: request.accepted_donor_id ?? null,
        status: 'to_pickup',
        driverLat: booking.driver_lat,
        driverLng: booking.driver_lng,
        pickupLat: rideDraft.pickupLat,
        pickupLng: rideDraft.pickupLng,
        dropLat: rideDraft.dropLat,
        dropLng: rideDraft.dropLng,
      })
      toast.success('Ride booked successfully')
    } catch (err: any) {
      toast.error(err.message || 'Unable to book vehicle')
    } finally {
      setShowRideModal(false)
      setRideLoading(false)
    }
  }

  function cancelRide() {
    if (!rideBooked) return
    setRideBooked(null)
    setTransportChoice(null)
    setRideDraft(null)
    toast.success('Ride cancelled')
  }

  function reportIssue() {
    toast('Issue reported. Support team has been alerted.', { icon: '✅' })
  }

  if (loading || !request) {
    return (
      <>
        <TopBar title="Blood Request Status" subtitle="Loading details" back emergency />
        <div className="h-64 flex flex-col items-center justify-center gap-2">
          <HeartbeatIcon size={40} />
          <p className="text-sm text-gray-500">Fetching latest request status...</p>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar
        title="Blood Request Status"
        subtitle={`${parsePatientName(request)} · ${request.hospital_name || 'Hospital'}`}
        back
        emergency
      />

      <div className="px-4 py-4 space-y-4">
        <Card className="p-4 border-blue-200 bg-gradient-to-br from-white to-blue-50">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <BloodGroupBadge group={request.blood_group} size="lg" className="bg-red-50 border-red-200 text-red-700" />
              <p className="text-sm font-bold text-slate-900">{totalUnits} {totalUnits === 1 ? 'Unit' : 'Units'} Required</p>
              <div className="text-xs text-slate-600 flex items-start gap-1.5">
                <MapPin size={14} className="mt-0.5 text-blue-700" />
                <span>{request.hospital_name || 'Hospital'} · {request.hospital_address || 'Location shared by requester'}</span>
              </div>
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock3 size={14} className="text-red-600" />
                <span>Time Left: {countdown}</span>
              </div>
            </div>

            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-blue-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">Units Progress</p>
            <p className="text-xs font-semibold text-slate-600">{fulfilledUnits} of {totalUnits} Units Fulfilled</p>
          </div>
          <div className="mt-3 h-2.5 w-full rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
        </Card>

        {showDonorSection && (
          <Card className="p-4 border-blue-300 bg-gradient-to-br from-white to-blue-50">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">Donor Status</p>
                <p className="mt-1 text-xs text-slate-600">{request.status === 'accepted' ? 'Donor Accepted' : 'Donor En Route'}</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2.5 py-1 text-xs font-semibold">
                <Navigation size={13} className="mr-1" />
                Live Tracking
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{donorName}</p>
                  <p className="text-xs text-slate-500">ID masked for privacy</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-1 text-xs font-semibold">
                    <Star size={12} className="mr-1" />
                    {Math.round(donorTrust)}
                  </span>
                  {donorVerified && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-1 text-xs font-semibold">
                      <ShieldCheck size={12} className="mr-1" />
                      Verified
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                  <p className="text-[11px] text-slate-500">Distance</p>
                  <p className="text-sm font-bold text-slate-900">{effectiveDistance !== null ? `${effectiveDistance.toFixed(1)} km` : '---'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                  <p className="text-[11px] text-slate-500">ETA</p>
                  <p className="text-sm font-bold text-slate-900">{effectiveEta !== null ? `${effectiveEta} min` : '---'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                  <p className="text-[11px] text-slate-500">Updated</p>
                  <p className="text-sm font-bold text-slate-900">{lastUpdatedText}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {transportEligible && (
          <Card className="p-4 border-blue-300 bg-gradient-to-br from-white to-blue-50">
            {!rideBooked ? (
              <>
                <h3 className="text-sm font-bold text-slate-900">Transport Assistance</h3>
                <p className="mt-1 text-xs text-slate-600">Need help reaching the hospital faster?</p>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {[{
                    key: 'bike' as TransportChoice,
                    title: 'Book Bike',
                    desc: 'Fastest option',
                    icon: <Bike size={16} />,
                  }, {
                    key: 'cab' as TransportChoice,
                    title: 'Book Cab',
                    desc: 'Comfort option',
                    icon: <Car size={16} />,
                  }, {
                    key: 'self' as TransportChoice,
                    title: 'I will Manage Myself',
                    desc: 'No ride needed',
                    icon: <CheckCircle2 size={16} />,
                  }].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTransportChoice(opt.key)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${transportChoice === opt.key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400' : 'border-slate-200 bg-white hover:border-blue-300'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-blue-700">{opt.icon}</span>
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{opt.title}</span>
                          <span className="block text-xs text-slate-600">{opt.desc}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  className="mt-3 bg-blue-700 hover:bg-blue-800"
                  onClick={startArrangeRide}
                >
                  Arrange Ride
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Ride Booked</h3>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Live</span>
                </div>

                <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-3 space-y-2">
                  <p className="text-xs text-slate-600">Driver Name</p>
                  <p className="text-sm font-bold text-slate-900">{rideBooked.driverName}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Vehicle Type</p>
                      <p className="font-semibold text-slate-900">{rideBooked.vehicleType === 'bike' ? 'Bike' : 'Cab'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Vehicle Number</p>
                      <p className="font-semibold text-slate-900">{rideBooked.vehicleNumber}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">ETA to Pickup</p>
                      <p className="font-semibold text-slate-900">{rideBooked.etaToPickupMin} min</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Tracking Link</p>
                      <p className="font-semibold text-slate-900">{rideBooked.trackingId}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-500">Linked Donor</p>
                      <p className="font-semibold text-slate-900">{rideBooked.linkedDonorId ?? 'masked-donor'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    onClick={cancelRide}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Cancel Ride
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    onClick={reportIssue}
                    icon={<AlertTriangle size={15} />}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Report Issue
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}

        {showMap && (
          <Card className="p-0 overflow-hidden border-blue-300">
            <div className="h-64">
              <TrackingMap
                hospitalLat={request.hospital_lat}
                hospitalLng={request.hospital_lng}
                hospitalName={request.hospital_name || 'Hospital'}
                donorName={donorName}
                donorLat={donorMarkerForMap?.lat}
                donorLng={donorMarkerForMap?.lng}
                vehicleLat={rideBooked?.driverLat}
                vehicleLng={rideBooked?.driverLng}
              />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-2 pb-4">
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={contactDonor}
            icon={<Phone size={16} />}
            disabled={!showDonorSection}
            className="bg-blue-700 hover:bg-blue-800"
          >
            Contact Donor {showDonorSection ? `(${donorPhoneMasked})` : ''}
          </Button>

          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={requestAdditionalUnits}
            icon={<PlusCircle size={16} />}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
            disabled={unitsUpdating || request.status === 'completed' || request.status === 'cancelled'}
          >
            {unitsUpdating ? 'Updating Units...' : 'Request Additional Units'}
          </Button>

          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={cancelRequest}
            icon={<XCircle size={16} />}
            className="border-red-300 text-red-700 hover:bg-red-50"
            disabled={request.status === 'completed' || request.status === 'cancelled'}
          >
            Cancel Request
          </Button>
        </div>

        <Card className="p-3 border-slate-200 bg-white">
          <div className="flex items-start gap-2 text-xs text-slate-700">
            <UserRound size={14} className="mt-0.5 text-blue-700" />
            <p>
              Flow: Searching to Donor Found to Donor En Route to Completed. If a donor cancels and status returns to pending,
              this screen automatically returns to Searching for Donors and progress is recalculated.
            </p>
          </div>
        </Card>
      </div>

      {showRideModal && rideDraft && transportChoice && transportChoice !== 'self' && (
        <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-md rounded-2xl bg-white border border-blue-200 shadow-2xl p-4 space-y-3">
            <h3 className="text-base font-bold text-slate-900">Confirm Transport</h3>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-slate-700 space-y-2">
              <p><span className="font-semibold">Pickup:</span> Donor Location</p>
              <p><span className="font-semibold">Drop:</span> Hospital Location</p>
              <p><span className="font-semibold">Estimated Time:</span> {rideDraft.etaToHospitalMin} min</p>
              <p><span className="font-semibold">Estimated Cost:</span> INR {rideDraft.estimatedCostInr}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" fullWidth onClick={() => setShowRideModal(false)}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                fullWidth
                className="bg-blue-700 hover:bg-blue-800"
                onClick={confirmRide}
                loading={rideLoading}
              >
                Confirm Ride
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
