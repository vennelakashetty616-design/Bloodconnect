'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Droplet, MapPin, Calendar, Activity, LogOut, Bell, ChevronRight, Building2, UserRound } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { BloodGroupBadge } from '@/components/ui/Badge'
import { useAuth } from '@/hooks/useAuth'
import { getCurrentPosition } from '@/lib/geolocation'
import { cn } from '@/lib/utils'
import { format, parseISO, differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'
import Link from 'next/link'

type DonationLog = {
  id: string
  donatedAt: string
  hospital: string
  recipient: string
  units: number
}

type BasicProfileSetup = {
  date_of_birth: string
  gender: string
  weight_kg: string | number
  blood_group: string
  city: string
  pincode: string
  last_donation_date: string
}

export default function DonorProfilePage() {
  const { user, donor, signOut } = useAuth()
  const [toggling, setToggling] = useState(false)
  const [updatingLocation, setUpdatingLocation] = useState(false)
  const [isAvailable, setIsAvailable] = useState(donor?.is_available ?? true)
  const [basicSetup, setBasicSetup] = useState<BasicProfileSetup | null>(null)

  useEffect(() => {
    if (donor) setIsAvailable(donor.is_available)
  }, [donor])

  useEffect(() => {
    let isMounted = true

    async function loadBasicSetup() {
      if (!user) return

      try {
        const res = await fetch('/api/auth/profile')
        if (!res.ok) return
        const json = await res.json()
        if (!isMounted) return
        if (json?.profile_setup) {
          setBasicSetup(json.profile_setup as BasicProfileSetup)
        }
      } catch {
        // Ignore setup fetch failures on profile page.
      }
    }

    loadBasicSetup()
    return () => {
      isMounted = false
    }
  }, [user?.email])

  async function toggleAvailability(val: boolean) {
    setToggling(true)
    setIsAvailable(val)
    try {
      await fetch('/api/donors/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: val }),
      })
      toast.success(val ? '✅ You are now available as a donor' : '⏸ Availability paused')
    } catch {
      setIsAvailable(!val)
      toast.error('Failed to update status')
    } finally {
      setToggling(false)
    }
  }

  async function updateLocation() {
    setUpdatingLocation(true)
    try {
      const pos = await getCurrentPosition()
      await fetch('/api/donors/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: pos.latitude, longitude: pos.longitude }),
      })
      toast.success('📍 Location updated!')
    } catch {
      toast.error('Could not detect location')
    } finally {
      setUpdatingLocation(false)
    }
  }

  const daysSinceDonation = donor?.last_donation_date
    ? differenceInDays(new Date(), parseISO(donor.last_donation_date))
    : null
  const eligibleAgain = daysSinceDonation !== null ? Math.max(0, 56 - daysSinceDonation) : 0
  const isEligible = daysSinceDonation === null || daysSinceDonation >= 56
  const totalUnitsDonated = donor?.total_donations ?? 0
  const donationLog: DonationLog[] = []
  const displayName = user?.full_name?.trim() || user?.email?.split('@')[0] || 'Hero Donor'

  return (
    <>
      <TopBar title="My Profile" />

      <div className="px-4 py-4 space-y-4">
        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="hero-gradient rounded-2xl p-5 text-white shadow-blood-lg"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-4xl">
              🦸
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black">{displayName}</h2>
              <p className="text-red-100 text-sm font-semibold">Donor Account</p>
              <p className="text-red-200 text-sm">{user?.email}</p>
              {donor && (
                <div className="flex items-center gap-2 mt-2">
                  <BloodGroupBadge group={donor.blood_group as any} size="sm" className="bg-white/20 text-white border-white/30" />
                  <span className="text-red-100 text-xs">
                    {donor.total_donations} donations
                  </span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Donor stats */}
        {donor && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Donations', value: donor.total_donations, icon: <Droplet size={16} className="text-blood-500" /> },
              { label: 'Trust Score', value: donor.trust_score, icon: <Activity size={16} className="text-red-600" /> },
              {
                label: 'Response',
                value: `${Math.round((donor.response_rate ?? 0) * 100)}%`,
                icon: <Bell size={16} className="text-red-600" />,
              },
            ].map((s) => (
              <Card key={s.label} className="p-3 text-center">
                <div className="flex justify-center mb-1">{s.icon}</div>
                <div className="font-black text-lg text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Availability toggle */}
        {donor && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 text-sm">Available to Donate</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isAvailable ? 'You appear in emergency searches' : 'You are hidden from searches'}
                </p>
              </div>
              <button
                onClick={() => toggleAvailability(!isAvailable)}
                disabled={toggling}
                className={cn(
                  'relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none',
                  isAvailable ? 'bg-blood-600' : 'bg-gray-200'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200',
                    isAvailable && 'translate-x-5'
                  )}
                />
              </button>
            </div>

            {/* Eligibility */}
            <div className={cn(
              'mt-3 p-2.5 rounded-xl text-xs font-medium',
              isEligible ? 'bg-amber-50 text-red-700' : 'bg-amber-50 text-red-700'
            )}>
              {isEligible ? (
                <span>✅ You are eligible to donate blood today</span>
              ) : (
                <span>⏳ Eligible to donate again in {eligibleAgain} days</span>
              )}
            </div>
          </Card>
        )}

        {/* Last donation */}
        {donor?.last_donation_date && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <Calendar className="text-red-700" size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Last Donation</p>
                <p className="text-xs text-gray-500">
                  {format(parseISO(donor.last_donation_date), 'MMMM d, yyyy')}
                  {' '}({daysSinceDonation} days ago)
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Basic profile setup details */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-gray-900">Basic Profile Setup</h3>
            <Link href="/auth/profile-setup?redirect=/donor/profile" className="text-xs font-bold text-red-700 hover:underline">
              Edit
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {[
              ['Date of Birth', basicSetup?.date_of_birth || '-'],
              ['Gender', basicSetup?.gender || '-'],
              ['Weight', basicSetup?.weight_kg ? `${basicSetup.weight_kg} kg` : '-'],
              ['Blood Group', basicSetup?.blood_group || donor?.blood_group || '-'],
              ['City', basicSetup?.city || '-'],
              ['Pincode', basicSetup?.pincode || '-'],
              [
                'Last Donation Date',
                basicSetup?.last_donation_date
                  ? format(parseISO(basicSetup.last_donation_date), 'MMMM d, yyyy')
                  : donor?.last_donation_date
                    ? format(parseISO(donor.last_donation_date), 'MMMM d, yyyy')
                    : '-',
              ],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-0.5 text-sm font-bold text-gray-900">{String(value)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Donation timeline */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-gray-900">Donation Journey</h3>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-red-700">
              {donor?.total_donations ?? 0} donations
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50 to-white p-3">
            <p className="text-xs text-gray-500">Total units donated</p>
            <p className="text-2xl font-black text-red-700">{totalUnitsDonated} units</p>
          </div>

          <div className="space-y-2.5">
            {donationLog.length > 0 ? donationLog.map((entry, index) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.06 }}
                className="rounded-xl border border-gray-100 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-800">
                      {format(parseISO(entry.donatedAt), 'MMM d, yyyy · h:mm a')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {entry.units} unit{entry.units > 1 ? 's' : ''} donated
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-red-700">
                    #{index + 1}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Building2 size={13} className="text-blood-500" />
                    {entry.hospital}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <UserRound size={13} className="text-red-600" />
                    Donated to: {entry.recipient}
                  </div>
                </div>
              </motion.div>
            )) : (
              <div className="rounded-xl border border-gray-100 p-3 text-xs text-gray-500">
                Donation records will appear here after completed donations.
              </div>
            )}
          </div>
        </Card>

        {/* Update location */}
        <Button
          variant="secondary"
          fullWidth
          size="md"
          loading={updatingLocation}
          onClick={updateLocation}
          icon={<MapPin size={16} />}
        >
          Update My Location
        </Button>

        {/* Menu items */}
        <div className="space-y-2">
          {[
            { label: 'Notifications', href: '/notifications', icon: <Bell size={18} className="text-gray-400" /> },
            { label: 'My Requests', href: '/request/history', icon: <Droplet size={18} className="text-gray-400" /> },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card hover className="flex items-center gap-3 p-4 mb-2">
                {item.icon}
                <span className="flex-1 text-sm font-semibold text-gray-800">{item.label}</span>
                <ChevronRight size={16} className="text-gray-300" />
              </Card>
            </Link>
          ))}
        </div>

        {/* Sign out */}
        <Button
          variant="ghost"
          fullWidth
          size="md"
          className="text-red-600 hover:bg-amber-50"
          onClick={async () => {
            await signOut()
            window.location.href = '/'
          }}
          icon={<LogOut size={16} />}
        >
          Sign Out
        </Button>

        <div className="text-center text-xs text-gray-300 pb-4">
          v1.0 · Made with ❤️ to save lives
        </div>
      </div>
    </>
  )
}
