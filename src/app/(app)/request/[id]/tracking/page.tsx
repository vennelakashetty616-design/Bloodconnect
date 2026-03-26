'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { MapPin, Clock, Droplet, Navigation, CheckCircle } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { HeartbeatIcon, HeartbeatWave } from '@/components/ui/HeartbeatIcon'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { watchPosition, geocodeAddress } from '@/lib/geolocation'
import { haversineDistance, estimateMinutes, formatDistance, formatETA } from '@/lib/matching'
import { startHeartbeat, updateHeartbeatBPM, stopHeartbeat, resumeAudioContext } from '@/lib/heartbeat'
import { BloodRequest } from '@/types'
import toast from 'react-hot-toast'

const TrackingMap = dynamic(() => import('@/components/map/TrackingMap'), { ssr: false })

const TRACKING_INTERVAL_MS = parseInt(process.env.NEXT_PUBLIC_TRACKING_INTERVAL_MS ?? '5000')

export default function DonorTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const requestId = params.id as string
  const { donor } = useAuth()

  const [request, setRequest] = useState<BloodRequest | null>(null)
  const [geocoded, setGeocoded] = useState(false)       // true once hospital coords are fresh
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [etaMin, setEtaMin] = useState<number | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [arrived, setArrived] = useState(false)

  const stopWatchRef = useRef<(() => void) | null>(null)
  const lastPushRef = useRef<number>(0)
  const requestRef = useRef<BloodRequest | null>(null)

  // Keep a ref in sync so GPS callbacks always see the latest request
  useEffect(() => { requestRef.current = request }, [request])

  // ── Load request ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!requestId) return
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient()
      supabase
        .from('blood_requests')
        .select('*')
        .eq('id', requestId)
        .single()
        .then(({ data }) => {
          if (data) setRequest(data as BloodRequest)
          else loadDemoRequest(requestId)
        })
    } else {
      loadDemoRequest(requestId)
    }
  }, [requestId])

  function loadDemoRequest(rid: string) {
    try {
      const stored = localStorage.getItem('fuellife_active_request')
      if (stored) {
        setRequest({ ...JSON.parse(stored), id: rid })
        return
      }
    } catch {}
    // Last-resort hardcoded fallback – geocoding will correct coords
    setRequest({
      id: rid,
      requester_id: 'demo',
      blood_group: 'O+',
      hospital_name: 'Manipal Hospital',
      hospital_address: 'Bangalore',
      hospital_lat: 12.9716,
      hospital_lng: 77.5946,
      requester_lat: 12.9716,
      requester_lng: 77.5946,
      contact_number: '+91 98765 43210',
      units_needed: 2,
      urgency: 'critical',
      status: 'accepted',
      notes: 'Demo request',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    } as BloodRequest)
  }

  // ── Re-geocode hospital to get exact coordinates ─────────────────────
  useEffect(() => {
    if (!request) return
    setGeocoded(false)
    const query = [request.hospital_name, request.hospital_address].filter(Boolean).join(', ')
    if (!query) { setGeocoded(true); return }

    geocodeAddress(query)
      .then((coords) => {
        if (coords) {
          setRequest((prev) =>
            prev ? { ...prev, hospital_lat: coords.lat, hospital_lng: coords.lng } : prev
          )
        }
      })
      .catch(() => {})
      .finally(() => setGeocoded(true))
  }, [request?.id])

  // ── Start tracking ───────────────────────────────────────────────────
  function startTracking() {
    if (!geocoded) {
      toast('Still locating hospital…', { icon: '📍' })
      return
    }
    resumeAudioContext()
    startHeartbeat(70)
    setIsTracking(true)

    // Always use real device GPS — skip Supabase push in demo mode
    stopWatchRef.current = watchPosition(
      async (pos) => {
        const req = requestRef.current
        if (!req) return

        setMyLat(pos.latitude)
        setMyLng(pos.longitude)

        const dist = haversineDistance(pos.latitude, pos.longitude, req.hospital_lat, req.hospital_lng)
        const eta  = estimateMinutes(dist)
        setDistanceKm(parseFloat(dist.toFixed(2)))
        setEtaMin(eta)
        updateHeartbeatBPM(Math.round(60 + Math.max(0, 1 - dist / 10) * 80))

        // Push GPS to server only when Supabase is configured
        if (isSupabaseConfigured() && donor) {
          const now = Date.now()
          if (now - lastPushRef.current >= TRACKING_INTERVAL_MS) {
            lastPushRef.current = now
            await fetch('/api/tracking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                donor_id: donor.id,
                request_id: requestId,
                latitude: pos.latitude,
                longitude: pos.longitude,
                accuracy: pos.accuracy,
                speed_kmh: 0,
              }),
            }).catch(() => {})
          }
        }

        // Auto-arrive if within 100 m of hospital
        if (dist < 0.1 && !arrived) {
          handleArrived()
        }
      },
      (err) => {
        console.error('GPS error', err)
        toast.error('GPS unavailable – check browser permissions')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )

    // Update status to in_transit when Supabase is live
    if (isSupabaseConfigured()) {
      fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_transit' }),
      }).catch(() => {})
    }

    toast.success('📍 Live GPS tracking started!')
  }

  function stopTracking() {
    stopWatchRef.current?.()
    stopHeartbeat()
    setIsTracking(false)
  }

  async function handleArrived() {
    stopTracking()
    setArrived(true)
    await fetch(`/api/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'arrived' }),
    })
    toast.success('🏥 You have arrived! Thank you, hero!')
  }

  async function handleDonationComplete() {
    await fetch(`/api/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    // Update last donation date
    if (donor) {
      await fetch('/api/donors/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_donation_date: new Date().toISOString().split('T')[0] }),
      })
    }
    toast.success('💖 You saved a life today! Amazing!')
    router.push('/donor/profile')
  }

  useEffect(() => () => stopTracking(), [])

  if (!request) {
    return (
      <>
        <TopBar title="Donor Navigation" back />
        <div className="flex flex-col items-center justify-center h-64">
          <HeartbeatIcon size={48} />
          <p className="text-gray-400 text-sm mt-3 animate-pulse">Loading mission...</p>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Donor Navigation" subtitle={`To: ${request.hospital_name}`} back emergency />

      <div className="px-4 py-4 space-y-4">
        {/* Status banner */}
        <motion.div
          className="hero-gradient text-white rounded-2xl p-4 text-center shadow-blood-lg"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {arrived ? (
            <>
              <CheckCircle className="mx-auto mb-2 text-white" size={40} />
              <p className="text-lg font-black">You Arrived! 🎉</p>
              <p className="text-red-100 text-sm">Thank you for being a hero today.</p>
            </>
          ) : isTracking ? (
            <>
              <p className="font-black text-lg mb-1">🚗 You&apos;re on a life-saving mission</p>
              <HeartbeatWave bpm={distanceKm ? Math.max(60, 130 - distanceKm * 8) : 70} className="my-2 opacity-50" />
              <p className="text-red-100 text-sm">Patient can see you in real-time</p>
            </>
          ) : (
            <>
              <HeartbeatIcon size={40} color="#fff" className="mx-auto mb-2" />
              <p className="font-black text-lg">Ready to save a life?</p>
              <p className="text-red-100 text-sm mt-1">Start tracking to show the patient you&apos;re on the way</p>
            </>
          )}
        </motion.div>

        {/* Stats */}
        {isTracking && !arrived && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 text-center">
              <MapPin className="mx-auto text-blood-500 mb-1" size={20} />
              <div className="text-2xl font-black">{distanceKm !== null ? formatDistance(distanceKm) : '—'}</div>
              <div className="text-xs text-gray-400">To hospital</div>
            </Card>
            <Card className="p-4 text-center">
              <Clock className="mx-auto text-blood-500 mb-1" size={20} />
              <div className="text-2xl font-black">{etaMin !== null ? `${etaMin}m` : '—'}</div>
              <div className="text-xs text-gray-400">ETA</div>
            </Card>
          </div>
        )}

        {/* Map */}
        <div className="relative h-56 rounded-2xl overflow-hidden shadow-card">
          <TrackingMap
            hospitalLat={request.hospital_lat}
            hospitalLng={request.hospital_lng}
            donorLat={myLat}
            donorLng={myLng}
            hospitalName={request.hospital_name}
          />
          {/* Overlay while geocoding hospital location */}
          {!geocoded && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-[1001] rounded-2xl gap-2">
              <HeartbeatIcon size={32} />
              <p className="text-xs font-bold text-gray-600 animate-pulse">Locating {request.hospital_name}…</p>
            </div>
          )}
        </div>

        {/* Request info */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-care-50 rounded-xl flex items-center justify-center">
              <MapPin className="text-trust-700" size={18} />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-900">{request.hospital_name}</p>
              <p className="text-xs text-gray-500">{request.hospital_address}</p>
              <p className="text-xs text-trust-700 font-semibold mt-1">
                📞 Contact: {request.contact_number}
              </p>
            </div>
          </div>
        </Card>

        {/* Action buttons */}
        {!arrived && !isTracking && (
          <Button
            variant="emergency"
            size="xl"
            fullWidth
            onClick={startTracking}
            disabled={!geocoded}
            icon={geocoded ? <Navigation size={20} /> : <HeartbeatIcon size={20} color="#fff" />}
          >
            {geocoded ? 'Start Navigation & Share Location' : 'Locating hospital…'}
          </Button>
        )}

        {isTracking && !arrived && (
          <div className="space-y-3">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleArrived}
              icon={<CheckCircle size={20} />}
              className="bg-red-600 hover:bg-red-700"
            >
              I&apos;ve Arrived at the Hospital
            </Button>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={stopTracking}
              className="text-gray-400 text-xs"
            >
              Pause tracking
            </Button>
          </div>
        )}

        {arrived && (
          <Button
            variant="primary"
            size="xl"
            fullWidth
            onClick={handleDonationComplete}
            icon={<Droplet size={20} />}
            className="bg-red-600 hover:bg-red-700"
          >
            Donation Complete ✓
          </Button>
        )}

        <div className="p-3 bg-care-50 border border-trust-100 rounded-xl text-xs text-trust-800">
          💡 Your real GPS location is shared live with the patient every 5 seconds. Keep this app open.
        </div>
      </div>
    </>
  )
}
