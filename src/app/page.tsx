'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, Droplet, MapPin, Shield, Clock3, Users, Siren, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const FEATURES = [
  {
    icon: <MapPin className="text-red-700" size={20} />,
    title: 'Nearest-Donor Matching',
    description: 'Locate nearby compatible donors in seconds with live distance ranking.',
  },
  {
    icon: <Activity className="text-red-700" size={20} />,
    title: 'Live Request Flow',
    description: 'Track request lifecycle from match to arrival with real-time status updates.',
  },
  {
    icon: <Shield className="text-red-700" size={20} />,
    title: 'Trust-Based Decisions',
    description: 'Trust score, response history, and donation behavior are visible before contact.',
  },
  {
    icon: <Clock3 className="text-red-700" size={20} />,
    title: 'Fast Emergency Response',
    description: 'Prioritize critical SOS routes and shorten time-to-donor during emergencies.',
  },
]

const STATS = [
  ['12k+', 'Lives Assisted'],
  ['48k+', 'Active Donors'],
  ['200+', 'Cities'],
  ['< 8m', 'Avg Match Time'],
]

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(120deg,#fff7ef_0%,#fff5d8_55%,#fff1f3_100%)] text-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-16 h-80 w-80 rounded-full bg-red-200/65 blur-3xl" />
        <div className="absolute right-0 top-0 h-[28rem] w-[28rem] rounded-full bg-amber-200/60 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-yellow-100/75 blur-3xl" />
      </div>

      <section className="relative isolate flex min-h-screen items-center overflow-hidden pb-28 pt-10 md:pt-16">
        <img
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          src="/blood-donation-animate.svg"
          alt="Animated blood donation background"
        />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(248,113,113,0.43)_0%,rgba(248,113,113,0)_36%),radial-gradient(circle_at_82%_24%,rgba(253,224,71,0.34)_0%,rgba(253,224,71,0)_33%),linear-gradient(120deg,rgba(127,29,29,0.73)_0%,rgba(153,27,27,0.69)_38%,rgba(120,53,15,0.67)_100%)]" />

        <div className="mx-auto max-w-6xl px-5">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="relative max-w-3xl py-10 md:py-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-100/70 bg-yellow-100/15 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-yellow-50 shadow-sm backdrop-blur-sm">
              <Sparkles size={14} />
              Real-time Blood Response
            </div>

            <h1 className="mt-6 text-5xl font-extrabold leading-[0.9] text-white drop-shadow-[0_10px_30px_rgba(2,6,23,0.55)] sm:text-7xl md:text-8xl">
              Save <span className="text-rose-200">Lives</span>
              <br />
              with Faster,
              <br />
              <span className="text-amber-100">Smarter Matching.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg font-medium leading-relaxed text-slate-100 sm:text-2xl">
              A live network where donors, recipients, and hospitals connect instantly.
              Verified profiles, emergency routing, and transparent response tracking in one place.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/request/create">
                <Button
                  variant="primary"
                  size="xl"
                  className="w-full rounded-2xl border-2 border-yellow-100/95 bg-gradient-to-r from-amber-400 to-yellow-300 px-8 py-3 font-extrabold text-red-950 shadow-[0_10px_25px_rgba(251,191,36,0.42)] transition hover:from-amber-300 hover:to-yellow-200 sm:w-auto"
                  icon={<Droplet size={20} />}
                >
                  Request Blood Now
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button
                  variant="danger"
                  size="xl"
                  className="w-full rounded-2xl border-2 border-amber-100/95 bg-gradient-to-r from-red-600 to-red-700 px-8 py-3 font-extrabold text-amber-50 shadow-[0_10px_25px_rgba(177,18,38,0.32)] transition hover:from-red-500 hover:to-red-700 sm:w-auto"
                  icon={<Users size={20} />}
                >
                  Join as Donor
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {BLOOD_TYPES.map((group, index) => (
                <motion.span
                  key={group}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="rounded-full border border-yellow-100/45 bg-red-950/30 px-3 py-1 text-sm font-bold text-yellow-50 shadow-sm backdrop-blur-sm"
                >
                  {group}
                </motion.span>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATS.map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-yellow-100/35 bg-red-950/45 px-3 py-3 text-center shadow-sm backdrop-blur-sm">
                  <div className="text-2xl font-extrabold text-yellow-100">{value}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-yellow-50">{label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-yellow-100/65 bg-[linear-gradient(90deg,rgba(127,29,29,0.75)_0%,rgba(146,64,14,0.72)_100%)] px-3 py-3 shadow-[0_18px_45px_rgba(120,53,15,0.38)] backdrop-blur-md">
            <Link href="/auth/login">
              <Button
                variant="outline"
                size="md"
                className="rounded-xl border-2 border-yellow-100/95 bg-white/95 px-5 font-extrabold text-red-800 shadow hover:border-yellow-300"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/request/create">
              <Button
                variant="danger"
                size="md"
                className="rounded-xl border-2 border-amber-100/95 bg-gradient-to-r from-red-600 to-rose-700 px-5 font-extrabold text-yellow-50 shadow-lg hover:from-red-500 hover:to-rose-700"
                icon={<Siren size={16} />}
              >
                SOS
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="relative mx-auto flex min-h-screen w-full items-center overflow-hidden px-4 py-16 md:px-10 md:py-20">
        <div className="pointer-events-none absolute left-0 top-0 h-64 w-64 rounded-full bg-yellow-100/70 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-rose-100/70 blur-3xl" />

        <div className="relative w-full rounded-[2rem] border border-amber-200/85 bg-[linear-gradient(135deg,#fffdf5_0%,#fff4cf_45%,#ffe9ee_100%)] p-8 shadow-[0_20px_55px_rgba(120,53,15,0.14)] md:p-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">Core Experience</h2>
            <span className="rounded-full border border-amber-200 bg-gradient-to-r from-yellow-50 to-rose-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-red-700">Trusted + Fast + Verified</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ y: -3, scale: 1.01 }}
                className="min-h-64 rounded-2xl border border-amber-200/75 bg-gradient-to-br from-white via-white to-yellow-50 p-8 shadow-md"
              >
                <div className="mb-4 inline-flex rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-rose-50 p-2.5">{feature.icon}</div>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">{feature.title}</h3>
                <p className="mt-4 text-lg leading-relaxed text-slate-600 md:text-xl">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
