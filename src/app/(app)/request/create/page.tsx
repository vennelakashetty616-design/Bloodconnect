'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, UserRound, Droplet, AlertCircle, Navigation, NavigationOff } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { HeartbeatIcon } from '@/components/ui/HeartbeatIcon'
import { BLOOD_GROUPS } from '@/types'
import { reverseGeocode } from '@/lib/geolocation'
import { isSupabaseConfigured } from '@/lib/supabase/client'

function getGeoErrorMessage(err: GeolocationPositionError) {
  if (err.code === err.PERMISSION_DENIED) {
    return 'Location permission was denied. Allow location access for localhost:3000 and try again.'
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'Location is unavailable on this device/browser. Try opening the app in Chrome and enable device location.'
  }
  if (err.code === err.TIMEOUT) {
    return 'Location request timed out. Move near a window or retry with internet/Wi-Fi enabled.'
  }
  return 'Could not get location. Please type the address manually.'
}

const schema = z.object({
  patient_name: z.string().min(2, 'Enter patient name or initials'),
  age: z.coerce.number().min(1, 'Enter valid age').max(120, 'Age must be 120 or less'),
  gender: z.enum(['male', 'female', 'other'] as const),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const),
  units_needed: z.coerce.number().min(1).max(10),
  urgency: z.enum(['emergency', 'priority', 'normal']).default('priority'),
})
type FormData = z.infer<typeof schema>

const URGENCY_OPTIONS = [
  { value: 'emergency', label: '🔴 Emergency – Within 4 hours' },
  { value: 'priority', label: '🟡 Priority – Within 12 hours' },
  { value: 'normal', label: '🟢 Normal – Within 24–48 hours' },
]

export default function CreateRequestPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [submitting, setSubmitting] = useState(false)
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)
  const [requestAddress, setRequestAddress] = useState('')
  const [isLiveTracking, setIsLiveTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  const { register, handleSubmit, control, watch, trigger, getValues, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { urgency: 'priority', units_needed: 1, gender: 'other' },
  })

  // Cleanup live tracking on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  async function applyPosition(lat: number, lng: number) {
    setMyLat(lat)
    setMyLng(lng)
    try {
      const addr = await reverseGeocode(lat, lng)
      if (addr) setRequestAddress(addr)
    } catch {}
  }

  function startLiveTracking() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.')
      return
    }
    if (!window.isSecureContext) {
      toast.error('Location requires a secure context. Use http://localhost:3000 in a regular browser.')
      return
    }
    if (watchIdRef.current !== null) return // already watching

    let receivedFirstFix = false
    setIsLiveTracking(true)

    // Try high-accuracy GPS first; fall back to IP/network location on error
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        applyPosition(pos.coords.latitude, pos.coords.longitude)
        if (!receivedFirstFix) {
          receivedFirstFix = true
          toast.success('📡 Live location sharing started')
        }
      },
      (watchErr) => {
        // High-accuracy failed (common on desktop) — try low-accuracy fallback
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            applyPosition(pos.coords.latitude, pos.coords.longitude)
            if (!receivedFirstFix) {
              receivedFirstFix = true
              toast.success('📡 Live location sharing started')
            }
            toast('📡 Using approximate location (no GPS detected)', { icon: '⚠️' })
          },
          (fallbackErr) => {
            // Both failed — silently stop without extra error toast
            if (watchIdRef.current !== null) {
              navigator.geolocation.clearWatch(watchIdRef.current)
              watchIdRef.current = null
            }
            setIsLiveTracking(false)
            // Prefer low-accuracy error details; fallback to watch error details.
            toast.error(getGeoErrorMessage(fallbackErr || watchErr))
          },
          { enableHighAccuracy: false, timeout: 10000 }
        )
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  function stopLiveTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsLiveTracking(false)
    toast('🛑 Live location sharing stopped')
  }

  async function nextStep() {
    if (step === 1) {
      const ok = await trigger(['patient_name', 'age', 'gender', 'blood_group', 'units_needed'])
      if (ok) setStep(2)
    }
  }

  async function onSubmit(data: FormData) {
    if (!myLat || !myLng) {
      toast.error('Your location is required. Please enable GPS.')
      return
    }
    setSubmitting(true)
    try {
      // Check if in demo mode (via cookie from /api/demo)
      const isDemoMode = document.cookie.includes('demo_mode=true')

      // Demo mode — skip real API, store request locally and navigate
      if (isDemoMode || !isSupabaseConfigured()) {
        const demoId = `demo-${Date.now()}`
        const demoRequest = {
          id: demoId,
          ...data,
          hospital_name: `Patient: ${data.patient_name}`,
          hospital_address: requestAddress || 'Location shared by requester',
          hospital_lat: myLat,
          hospital_lng: myLng,
          requester_lat: myLat,
          requester_lng: myLng,
          status: 'pending',
          created_at: new Date().toISOString(),
        }
        try { localStorage.setItem('fuellife_active_request', JSON.stringify(demoRequest)) } catch {}
        toast.success('🩸 Request sent! Finding donors...')
        router.push(`/request/${demoId}`)
        return
      }

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          hospital_name: `Patient: ${data.patient_name}`,
          hospital_address: requestAddress || 'Location shared by requester',
          hospital_lat: myLat,
          hospital_lng: myLng,
          requester_lat: myLat,
          requester_lng: myLng,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success('🩸 Request sent! Finding donors...')
      router.push(`/request/${json.request.id}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create request')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedBloodGroup = watch('blood_group')
  const urgency = watch('urgency')

  return (
    <>
      <TopBar
        title="Blood Request"
        subtitle="Find donors for your patient"
        back
        emergency
      />

      <div className="px-4 py-5 space-y-5">
        {/* Progress bar */}
        <div className="flex gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                s <= step ? 'bg-blood-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>



        <form onSubmit={handleSubmit(onSubmit)}>
          <AnimatePresence mode="wait">
            {/* ── Step 1: Patient Details ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-4"
              >
                <div className="text-center py-4">
                  <HeartbeatIcon size={48} className="mx-auto mb-2" />
                  <h2 className="font-black text-xl text-gray-900">Patient Details</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Share essential patient information for faster matching.
                  </p>
                </div>

                <Input
                  label="Patient Name (or initials)"
                  placeholder="e.g. R.K."
                  icon={<UserRound size={16} />}
                  error={errors.patient_name?.message}
                  {...register('patient_name')}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Age"
                    type="number"
                    min={1}
                    max={120}
                    error={errors.age?.message}
                    {...register('age')}
                  />

                  <Select
                    label="Gender"
                    options={[
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                      { value: 'other', label: 'Other' },
                    ]}
                    error={errors.gender?.message}
                    {...register('gender')}
                  />
                </div>

                {/* Blood group grid */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Blood Group Required</p>
                  <Controller
                    control={control}
                    name="blood_group"
                    render={({ field }) => (
                      <div className="grid grid-cols-4 gap-2">
                        {BLOOD_GROUPS.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => field.onChange(g)}
                            className={`py-3 rounded-xl font-extrabold text-sm border-2 transition-all ${
                              field.value === g
                                ? 'bg-blood-600 text-white border-blood-600 shadow-blood scale-105'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-blood-300'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                  />
                  {errors.blood_group && (
                    <p className="text-xs text-care-600 mt-1">{errors.blood_group.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 block">Urgency Level</label>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">⏰ Response Timeline - Donors notified based on urgency</div>
                    {[
                      { value: 'emergency', label: '🔴 Emergency', time: 'Within 4 hours', color: 'bg-red-600', desc: 'Critical situation - All nearby donors notified immediately' },
                      { value: 'priority', label: '🟡 Priority', time: 'Within 12 hours', color: 'bg-amber-500', desc: 'Urgent need - High priority matching algorithm' },
                      { value: 'normal', label: '🟢 Normal', time: 'Within 24–48 hours', color: 'bg-green-600', desc: 'Planned transfusion - Standard matching process' },
                    ].map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        onClick={() => setValue('urgency', level.value as any)}
                        className={`w-full p-3 rounded-xl text-left border-2 transition-all ${
                          urgency === level.value
                            ? 'bg-care-50 border-blood-600 shadow-lg ring-1 ring-blood-300'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 flex items-center gap-2">
                            <div className={`w-2 h-8 rounded-full ${level.color}`} />
                            <div>
                              <div className="text-sm font-bold text-gray-900">{level.label}</div>
                              <div className="text-xs text-gray-600 mt-0.5">{level.desc}</div>
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-gray-600 whitespace-nowrap ml-2">{level.time}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Select
                  label=""
                  options={URGENCY_OPTIONS}
                  error={errors.urgency?.message}
                  className="hidden"
                  {...register('urgency')}
                />

                <Input
                  label="Units Needed"
                  type="number"
                  min={1}
                  max={10}
                  error={errors.units_needed?.message}
                  {...register('units_needed')}
                />

                {urgency === 'emergency' && (
                  <div className="flex items-start gap-2 p-3 bg-care-50 rounded-xl border border-care-100">
                    <AlertCircle size={16} className="text-care-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-care-700">
                      Emergency requests are immediately broadcast to all donors within 20 km and an emergency vehicle will be offered.
                    </p>
                  </div>
                )}

                <Button type="button" variant="primary" size="lg" fullWidth onClick={nextStep}>
                  Next: Confirm Request →
                </Button>
              </motion.div>
            )}

            {/* ── Step 2: Confirm ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-4"
              >
                <div className="text-center py-4">
                  <HeartbeatIcon size={48} className="mx-auto mb-2" fast />
                  <h2 className="font-black text-xl text-gray-900">Confirm Your Request</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Once submitted, donors will be notified immediately.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-card divide-y divide-gray-50">
                  {[
                    { label: 'Patient Name', value: getValues('patient_name') },
                    { label: 'Age', value: getValues('age') },
                    { label: 'Gender', value: getValues('gender') },
                    { label: 'Blood Group', value: selectedBloodGroup },
                    { label: 'Units Needed', value: getValues('units_needed') },
                    { label: 'Urgency', value: URGENCY_OPTIONS.find((o) => o.value === urgency)?.label ?? urgency },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-start px-4 py-3">
                      <span className="text-xs text-gray-500 font-medium">{row.label}</span>
                      <span className="text-xs font-bold text-gray-800 text-right max-w-[200px]">
                        {String(row.value)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Location status */}
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${
                  myLat ? 'bg-care-50 text-care-700' : 'bg-care-50 text-care-700'
                }`}>
                  {isLiveTracking ? (
                    <span className="w-2 h-2 rounded-full bg-care-500 animate-pulse shrink-0" />
                  ) : (
                    <MapPin size={14} className="shrink-0" />
                  )}
                  <span className="flex-1 truncate">
                    {myLat
                      ? `📍 Location detected (${myLat.toFixed(4)}, ${myLng?.toFixed(4)})`
                      : 'Click "Share Live Location" to allow GPS access'}
                    {isLiveTracking && <span className="ml-1 font-bold text-care-700"> · LIVE</span>}
                  </span>
                </div>

                {/* Live location buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={startLiveTracking}
                    disabled={isLiveTracking}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                      isLiveTracking
                        ? 'bg-care-50 border-care-300 text-red-400 cursor-not-allowed'
                        : 'bg-care-50 border-red-400 text-care-700 hover:bg-care-100 active:scale-95'
                    }`}
                  >
                    <Navigation size={14} />
                    Share Live Location
                  </button>
                  <button
                    type="button"
                    onClick={stopLiveTracking}
                    disabled={!isLiveTracking}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                      !isLiveTracking
                        ? 'bg-neutral-offwhite border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'bg-care-50 border-red-400 text-care-700 hover:bg-care-100 active:scale-95'
                    }`}
                  >
                    <NavigationOff size={14} />
                    Stop Live Location
                  </button>
                </div>

                <div className="p-4 bg-care-50 rounded-2xl border border-care-200 text-sm text-blood-800 leading-relaxed">
                  🩸 <strong>What happens next:</strong> We&apos;ll search for compatible donors near your shared location. Matched donors receive an instant notification and you can track progress in real time.
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" fullWidth size="lg" onClick={() => setStep(1)}>
                    ← Edit
                  </Button>
                  <Button type="submit" variant="emergency" fullWidth size="lg"
                    loading={submitting}
                    icon={<Droplet size={18} />}
                  >
                    Send SOS
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </>
  )
}
