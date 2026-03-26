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
import { BloodRequest, BLOOD_GROUPS, BloodGroup } from '@/types'
import { formatDistance, estimateMinutes, haversineDistance } from '@/lib/matching'
import { getCurrentPosition } from '@/lib/geolocation'
import { timeAgo } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'

function getTimeLeftLabel(expiresAt?: string) {
  if (!expiresAt) return 'Time not set'
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Expired'
  const mins = Math.ceil(diffMs / 60000)
  if (mins < 60) return `${mins} min left`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (rem === 0) return `${hours}h left`
  return `${hours}h ${rem}m left`
}

function getRequesterTrustBadge(req: BloodRequest) {
  const requester = req.requester as any
  if (!requester) return { label: 'Requester Unverified', className: 'bg-gray-100 text-gray-600' }
  if (requester.phone && requester.email) return { label: 'Requester Trusted', className: 'bg-emerald-100 text-emerald-700' }
  if (requester.phone || requester.email) return { label: 'Requester Verified', className: 'bg-amber-100 text-amber-700' }
  return { label: 'Requester Unverified', className: 'bg-gray-100 text-gray-600' }
}

const MEDICAL_DECLARATION_ITEMS = [
  { key: 'no_fever_or_infection_7_days', label: 'No fever or infection in last 7 days' },
  { key: 'not_on_antibiotics', label: 'Not currently on antibiotics' },
  { key: 'no_recent_surgery_6_months', label: 'No recent surgery (last 6 months)' },
  { key: 'no_tattoo_or_piercing_6_12_months', label: 'No tattoo/piercing in last 6-12 months' },
  { key: 'no_recent_malaria_or_dengue', label: 'No recent malaria/dengue' },
  { key: 'not_pregnant_or_breastfeeding_if_applicable', label: 'Not pregnant / breastfeeding (if applicable)' },
  { key: 'not_within_cooling_period', label: 'I am not within my donation cooling period' },
  { key: 'physically_fit_today', label: 'I feel physically fit to donate today' },
] as const

type DeclarationKey = (typeof MEDICAL_DECLARATION_ITEMS)[number]['key']

function defaultDeclarationState(): Record<DeclarationKey, boolean> {
  return {
    no_fever_or_infection_7_days: false,
    not_on_antibiotics: false,
    no_recent_surgery_6_months: false,
    no_tattoo_or_piercing_6_12_months: false,
    no_recent_malaria_or_dengue: false,
    not_pregnant_or_breastfeeding_if_applicable: false,
    not_within_cooling_period: false,
    physically_fit_today: false,
  }
}

export default function DonorRequestsPage() {
  const { donor } = useAuth()
  const [accountBloodGroup, setAccountBloodGroup] = useState<BloodGroup | null>(null)
  const [profileSetupCompleted, setProfileSetupCompleted] = useState(false)
  const [requests, setRequests] = useState<BloodRequest[]>([])
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterGroup, setFilterGroup] = useState<BloodGroup | 'all'>('all')
  const [accepting, setAccepting] = useState<string | null>(null)
  const [pendingAccept, setPendingAccept] = useState<BloodRequest | null>(null)
  const [declaration, setDeclaration] = useState<Record<DeclarationKey, boolean>>(defaultDeclarationState)

  useEffect(() => {
    getCurrentPosition()
      .then((p) => {
        setMyLat(p.latitude)
        setMyLng(p.longitude)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadBloodGroup() {
      try {
        const res = await fetch('/api/auth/profile', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json().catch(() => ({}))
        if (!isMounted) return
        setProfileSetupCompleted(Boolean(json?.completed))
        const bg = json?.profile_setup?.blood_group
        if (typeof bg === 'string' && BLOOD_GROUPS.includes(bg as BloodGroup)) {
          setAccountBloodGroup(bg as BloodGroup)
        }
      } catch {
        // Ignore profile blood-group fetch failures.
      }
    }

    loadBloodGroup()
    return () => {
      isMounted = false
    }
  }, [])

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ status: 'requested,matched' })
      if (filterGroup !== 'all') query.set('blood_group', filterGroup)

      const res = await fetch(`/api/requests?${query.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Failed to load requests')
      setRequests((json.requests as BloodRequest[]) ?? [])
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to load requests')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [filterGroup])

  useEffect(() => {
    fetchRequests()
    const interval = window.setInterval(fetchRequests, 10000)
    return () => window.clearInterval(interval)
  }, [fetchRequests])

  async function acceptRequest(reqId: string, req: BloodRequest) {
    if (!profileSetupCompleted) {
      toast.error('Please update your profile before accepting requests')
      return
    }

    const userBloodGroup = donor?.blood_group ?? accountBloodGroup

    if (!userBloodGroup) {
      toast.error('Set your blood group in profile setup before accepting requests.')
      return
    }

    if (userBloodGroup !== req.blood_group) {
      toast.error(`Only ${req.blood_group} donors can accept this request.`)
      return
    }

    setPendingAccept(req)
    setDeclaration(defaultDeclarationState())
  }

  async function confirmAcceptWithDeclaration() {
    if (!pendingAccept) return

    const reqId = pendingAccept.id

    for (const item of MEDICAL_DECLARATION_ITEMS) {
      if (!declaration[item.key]) {
        toast.error(`not eligiable because of ${item.label.toLowerCase()}`)
        return
      }
    }

    setAccepting(reqId)
    try {
      const res = await fetch(`/api/requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'donor_committed',
          ...(donor?.id ? { accepted_donor_id: donor.id } : {}),
          self_declaration: declaration,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Request accepted. Head to the hospital.')
      setPendingAccept(null)
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
        {!profileSetupCompleted && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
            <p className="text-xs font-bold text-amber-800">Update your donor profile before accepting any request.</p>
            <Link href="/auth/profile-setup" className="mt-1 inline-block text-xs font-bold text-blood-700 underline">
              Complete profile setup
            </Link>
          </div>
        )}

        {(donor || accountBloodGroup) && (
          <div className="flex items-center gap-3 p-3 bg-care-50 rounded-xl border border-care-200">
            <BloodGroupBadge group={(donor?.blood_group ?? accountBloodGroup!) as BloodGroup} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blood-800">Showing all live requests</p>
              <p className="text-xs text-trust-700 truncate">
                Signed-in users with matching blood group can accept requests.
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
                const timeLeft = getTimeLeftLabel(req.expires_at)
                const trustBadge = getRequesterTrustBadge(req)

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

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                            {timeLeft}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${trustBadge.className}`}>
                            {trustBadge.label}
                          </span>
                        </div>

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
                            disabled={!profileSetupCompleted}
                            title={!profileSetupCompleted ? 'Complete profile setup to enable acceptance' : undefined}
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

      {pendingAccept && (
        <div className="fixed inset-0 z-50 bg-black/45 px-4 py-6 overflow-y-auto">
          <div className="mx-auto mt-6 w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">Please confirm the following before proceeding:</h3>
            <p className="mt-1 text-xs text-slate-500">Keep it short and strict. All items are required.</p>

            <div className="mt-3 space-y-2">
              {MEDICAL_DECLARATION_ITEMS.map((item) => (
                <label key={item.key} className="flex items-start gap-2 rounded-xl border border-amber-100 px-3 py-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={declaration[item.key]}
                    onChange={(e) => setDeclaration((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-red-600"
                  />
                  <span className="text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => setPendingAccept(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="emergency"
                fullWidth
                loading={accepting === pendingAccept.id}
                onClick={confirmAcceptWithDeclaration}
              >
                Confirm & Accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
