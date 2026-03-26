'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Droplet, MapPin, Clock, ChevronRight, Bell, ShieldCheck, Zap, Siren, UserRound, Radio } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { BloodGroupBadge, StatusBadge } from '@/components/ui/Badge'
import { useAuth } from '@/hooks/useAuth'
import { BloodRequest } from '@/types'
import { timeAgo } from '@/lib/utils'

function getProgressCopy(status: BloodRequest['status']) {
  switch (status) {
    case 'requested':
      return 'Waiting for donors to accept'
    case 'donor_committed':
      return 'Donor found for your request'
    case 'en_route':
      return 'Donor is on the way to your hospital'
    case 'donation_in_progress':
      return 'Donation in progress at hospital'
    case 'pending':
      return 'Waiting for donors to accept'
    case 'matched':
      return 'Matching donors found. Waiting for acceptance'
    case 'accepted':
      return 'Donor found for your request'
    case 'in_transit':
      return 'Donor is on the way to your hospital'
    case 'arrived':
      return 'Donor arrived at hospital'
    case 'completed':
      return 'Request completed successfully'
    case 'cancelled':
      return 'Request was cancelled'
    default:
      return 'Request in progress'
  }
}

export default function DashboardPage() {
  const { user, donor } = useAuth()
  const [myRequests, setMyRequests] = useState<BloodRequest[]>([])
  const [nearbyCount, setNearbyCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let mounted = true

    async function fetchDashboardData() {
      try {
        const res = await fetch('/api/requests?status=pending,matched,accepted,in_transit,arrived,completed,cancelled', {
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? 'Failed to load dashboard data')

        if (!mounted) return

        const all = (json.requests as BloodRequest[]) ?? []
        const mine = all
          .filter((r) => r.requester_id === user.id)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 5)
        setMyRequests(mine)

        const activeCount = all.filter((r) => r.status === 'pending' || r.status === 'matched').length
        setNearbyCount(activeCount)
      } catch {
        if (!mounted) return
        setMyRequests([])
        setNearbyCount(0)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchDashboardData()
    const interval = window.setInterval(fetchDashboardData, 10000)

    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [user])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.full_name?.split(' ')[0] ?? 'friend'

  return (
    <>
      <TopBar
        right={
          <Link href="/notifications" className="relative p-2">
            <Bell size={21} className="text-red-700" />
          </Link>
        }
      />

      <div className="relative z-10 px-4 pt-3 pb-2 space-y-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-amber-200 bg-white/95 p-5 shadow-[0_12px_32px_rgba(120,53,15,0.12)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700">
                <Radio size={12} />
                Response Console
              </span>
              <h1 className="mt-3 text-3xl font-black text-slate-900 leading-tight">
                {greeting}, {firstName}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {donor?.is_available
                  ? 'You are visible to nearby emergency requests.'
                  : 'Your donor status is paused. Enable it when ready.'}
              </p>
            </div>
            <span className="hidden sm:inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-red-700">
              <Siren size={18} />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Link href="/request/create">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                className="rounded-2xl shadow-none"
                icon={<Droplet size={17} />}
              >
                Create Blood Request
              </Button>
            </Link>
            <Link href="/donor/requests">
              <Button
                variant="outline"
                size="lg"
                fullWidth
                className="rounded-2xl border-amber-300 bg-white text-red-700"
                icon={<Zap size={17} />}
              >
                Browse Active Requests
              </Button>
            </Link>
          </div>
        </motion.section>

        {/* Donor quick stats */}
        {donor && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-3 gap-3"
          >
            {[
              { label: 'Donations', value: donor.total_donations, icon: <Droplet size={16} className="text-red-700" />, tone: 'bg-amber-50 border-amber-200' },
              { label: 'Trust Score', value: `${donor.trust_score}`, icon: <ShieldCheck size={16} className="text-red-700" />, tone: 'bg-amber-50 border-amber-200' },
              { label: 'Blood Type', value: donor.blood_group, icon: <span className="text-red-700 font-bold text-xs">●</span>, tone: 'bg-white border-amber-200' },
            ].map((stat) => (
              <Card key={stat.label} className={`p-3 text-center ${stat.tone}`}>
                <div className="flex justify-center mb-1">{stat.icon}</div>
                <div className="font-black text-lg text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </Card>
            ))}
          </motion.div>
        )}

        {/* Active SOS awareness */}
        {nearbyCount > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50">
                <MapPin className="text-red-700" size={20} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">
                  {nearbyCount} active emergenc{nearbyCount === 1 ? 'y' : 'ies'} nearby
                </p>
                <p className="text-xs text-slate-600">Open the donor feed to respond quickly.</p>
              </div>
              <Link href="/donor/requests">
                <ChevronRight className="text-red-500" size={20} />
              </Link>
            </div>
          </motion.div>
        )}

        {/* Recent activities feed */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900">Recent Activities</h2>
            <Link href="/request/history" className="text-red-700 text-sm font-semibold">
              View all
            </Link>
          </div>

          {loading ? (
            <Card className="p-4 bg-white">Loading activities...</Card>
          ) : myRequests.length > 0 ? (
            <div className="space-y-3">
              {myRequests.map((req, i) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 + i * 0.05 }}
                >
                  <Link href={`/request/${req.id}`}>
                    <Card hover className="border border-amber-200 bg-white p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BloodGroupBadge group={req.blood_group} size="sm" />
                          <StatusBadge status={req.status} />
                        </div>
                        <span className="text-xs text-slate-400">{timeAgo(req.created_at)}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <MapPin size={14} className="text-slate-400" />
                        {req.hospital_name}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-red-700 text-xs font-bold">
                        <span className={req.status === 'in_transit' ? 'animate-pulse' : ''}>●</span>
                        {getProgressCopy(req.status)}
                      </div>
                      <div className="mt-2 text-xs font-semibold text-red-700 flex items-center gap-1">
                        Open progress <ChevronRight size={13} />
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card className="p-5 border border-amber-200 bg-white text-center">
              <p className="text-sm text-slate-600 mb-3">No recent activities yet.</p>
              <Link href="/request/create">
                <Button variant="secondary" size="md" className="rounded-xl" icon={<Droplet size={16} />}>
                  Start First Request
                </Button>
              </Link>
            </Card>
          )}
        </section>

        {/* Quick actions */}
        <div>
          <h2 className="font-bold text-slate-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/donor/requests">
              <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                <Card hover className="border border-amber-200 bg-amber-50 p-4 text-center">
                  <Zap className="mx-auto mb-2 text-red-700" size={24} />
                  <p className="text-sm font-bold text-slate-800">Browse Requests</p>
                  <p className="text-xs text-slate-500 mt-0.5">See who needs blood</p>
                </Card>
              </motion.div>
            </Link>
            <Link href="/donor/profile">
              <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                <Card hover className="border border-amber-200 bg-amber-50 p-4 text-center">
                  <UserRound className="mx-auto mb-2 text-red-700" size={24} />
                  <p className="text-sm font-bold text-slate-800">My Profile</p>
                  <p className="text-xs text-slate-500 mt-0.5">Update availability</p>
                </Card>
              </motion.div>
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
