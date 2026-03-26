'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Clock, Droplet, ChevronRight, AlertCircle, Sparkles } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { Card } from '@/components/ui/Card'
import { BloodGroupBadge, UrgencyBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { HeartbeatIcon } from '@/components/ui/HeartbeatIcon'
import { getSupabaseClient } from '@/lib/supabase/client'
import { BloodRequest, BLOOD_GROUPS, BloodGroup } from '@/types'
import { formatDistance, estimateMinutes, haversineDistance } from '@/lib/matching'
import { getCurrentPosition } from '@/lib/geolocation'
import { timeAgo } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'

export default function DonorRequestsPage() {
  const { donor } = useAuth()
  const [requests, setRequests] = useState<BloodRequest[]>([])
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterGroup, setFilterGroup] = useState<BloodGroup | 'all'>('all')
  const [accepting, setAccepting] = useState<string | null>(null)

  useEffect(() => {
    getCurrentPosition()
      .then((p) => {
        setMyLat(p.latitude)
        setMyLng(p.longitude)
      })
      .catch(() => {})
  }, [])

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const supabase = getSupabaseClient()
    let query = supabase
      .from('blood_requests')
      .select('*, requester:profiles!requester_id(full_name, phone)')
      .in('status', ['pending', 'matched'])
      .order('created_at', { ascending: false })
      .limit(30)

    if (filterGroup !== 'all') {
      query = query.eq('blood_group', filterGroup)
    }

    const { data } = await query
    setRequests((data as BloodRequest[]) ?? [])
    setLoading(false)
  }, [filterGroup])

  useEffect(() => {
    fetchRequests()
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel('blood_requests_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blood_requests' }, fetchRequests)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchRequests])

  async function acceptRequest(reqId: string, req: BloodRequest) {
    if (!donor) {
      toast.error('You need a donor profile to accept requests.')
      return
    }

    if (donor.blood_group !== req.blood_group) {
      toast.error(`Only ${req.blood_group} donors can accept this request.`)
      return
    }

    setAccepting(reqId)
    try {
      const res = await fetch(`/api/requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted', accepted_donor_id: donor.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Request accepted. Head to the hospital.')
      window.location.href = `/request/${reqId}/tracking`
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAccepting(null)
    }
  }

  function getDistanceFromMe(req: BloodRequest): number | null {
    if (!myLat || !myLng) return null
    return parseFloat(haversineDistance(myLat, myLng, req.hospital_lat, req.hospital_lng).toFixed(1))
  }

  const visibleRequests = requests.slice().sort((a, b) => {
    const dA = getDistanceFromMe(a) ?? 999
    const dB = getDistanceFromMe(b) ?? 999
    return dA - dB
  })

  return (
    <>
      <TopBar title="Emergency Requests" subtitle="People need your blood nearby" />

      <div className="px-4 py-4 space-y-4">
        {donor && (
          <div className="flex items-center gap-3 p-3 bg-care-50 rounded-xl border border-care-200">
            <BloodGroupBadge group={donor.blood_group as BloodGroup} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blood-800">Showing all live requests</p>
              <p className="text-xs text-trust-700 truncate">
                Matching blood-group donors get request notifications first.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setFilterGroup('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              filterGroup === 'all'
                ? 'bg-blood-600 text-white border-blood-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            All Types
          </button>
          {BLOOD_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setFilterGroup(g)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                filterGroup === g
                  ? 'bg-blood-600 text-white border-blood-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <HeartbeatIcon size={40} />
            <p className="text-gray-500 text-sm">Finding requests near you...</p>
          </div>
        ) : (
          <>
            {visibleRequests.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-trust-200 bg-care-50 px-3 py-3"
              >
                <Sparkles size={15} className="text-trust-700" />
                <p className="text-xs font-semibold text-trust-800">
                  No live requests right now. You will be notified when a matching request is created.
                </p>
              </motion.div>
            )}

            <AnimatePresence>
              {visibleRequests.map((req, i) => {
                const dist = getDistanceFromMe(req)
                const eta = dist ? estimateMinutes(dist) : null

                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: i * 0.04 }}
                    className="donor-card"
                  >
                    <Card className="overflow-hidden">
                      <div
                        className={`h-1 ${
                          req.urgency === 'emergency'
                            ? 'bg-red-600'
                            : req.urgency === 'priority'
                              ? 'bg-amber-500'
                              : 'bg-green-300'
                        }`}
                      />

                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <BloodGroupBadge group={req.blood_group} size="lg" />
                            <UrgencyBadge urgency={req.urgency} />
                          </div>
                          <span className="text-xs text-gray-400">{timeAgo(req.created_at)}</span>
                        </div>

                        <div className="flex items-start gap-2">
                          <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{req.hospital_name}</p>
                            <p className="text-xs text-gray-500 leading-tight">{req.hospital_address}</p>
                          </div>
                        </div>

                        {dist !== null && (
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-trust-700">
                              <MapPin size={13} />
                              <span className="text-xs font-bold">{formatDistance(dist)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <Clock size={13} />
                              <span className="text-xs">{eta} min away</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-500">
                              <Droplet size={13} />
                              <span className="text-xs">
                                {req.units_needed} unit{req.units_needed > 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        )}

                        {req.notes && (
                          <div className="flex items-start gap-2 text-xs text-gray-500 bg-neutral-offwhite rounded-lg p-2">
                            <AlertCircle size={12} className="mt-0.5 shrink-0" />
                            {req.notes}
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Link href={`/request/${req.id}`} className="flex-1">
                            <Button variant="outline" fullWidth size="sm" icon={<ChevronRight size={15} />}>
                              View Details
                            </Button>
                          </Link>
                          <Button
                            variant="emergency"
                            size="sm"
                            className="flex-1"
                            loading={accepting === req.id}
                            onClick={() => acceptRequest(req.id, req)}
                            icon={<Droplet size={15} />}
                          >
                            Accept & Go
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </>
        )}
      </div>
    </>
  )
}
