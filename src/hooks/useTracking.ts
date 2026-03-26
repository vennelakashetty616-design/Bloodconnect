'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { DonorLocation, TrackingState, RequestStatus } from '@/types'
import { haversineDistance, estimateMinutes, getHeartbeatBPM } from '@/lib/matching'
import { startHeartbeat, updateHeartbeatBPM, stopHeartbeat } from '@/lib/heartbeat'
import { useAppStore } from '@/store/appStore'

export function useRealTimeTracking(requestId: string | null, hospitalLat: number, hospitalLng: number) {
  const { setTrackingState } = useAppStore()
  const [donorLoc, setDonorLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const [status, setStatus] = useState<RequestStatus>('in_transit')
  const initialDistRef = useRef<number | null>(null)
  const supabase = getSupabaseClient()

  const handleNewLocation = useCallback(
    (loc: DonorLocation) => {
      const { latitude, longitude } = loc
      const dist = haversineDistance(latitude, longitude, hospitalLat, hospitalLng)
      const eta = estimateMinutes(dist, loc.speed_kmh && loc.speed_kmh > 2 ? loc.speed_kmh : 30)

      if (initialDistRef.current === null) initialDistRef.current = dist

      setDonorLoc({ lat: latitude, lng: longitude })
      setDistanceKm(parseFloat(dist.toFixed(2)))
      setEtaMinutes(eta)

      // Update heartbeat
      const bpm = getHeartbeatBPM(dist, initialDistRef.current ?? 10)
      updateHeartbeatBPM(bpm)

      setTrackingState({
        donor_location: { lat: latitude, lng: longitude },
        hospital_location: { lat: hospitalLat, lng: hospitalLng },
        distance_remaining_km: parseFloat(dist.toFixed(2)),
        eta_minutes: eta,
        last_updated: loc.timestamp,
        status,
        vehicle: null,
      })
    },
    [hospitalLat, hospitalLng, status]
  )

  useEffect(() => {
    if (!requestId) return

    // Fetch last known location
    supabase
      .from('donor_locations')
      .select('*')
      .eq('request_id', requestId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) handleNewLocation(data as DonorLocation)
      })

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`tracking:${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donor_locations',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          handleNewLocation(payload.new as DonorLocation)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'blood_requests',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          setStatus(payload.new.status as RequestStatus)
        }
      )
      .subscribe()

    startHeartbeat(70)

    return () => {
      supabase.removeChannel(channel)
      stopHeartbeat()
    }
  }, [requestId, handleNewLocation])

  return { donorLoc, distanceKm, etaMinutes, status }
}
