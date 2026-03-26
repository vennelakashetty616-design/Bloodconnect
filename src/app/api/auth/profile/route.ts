import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

function normalizeGender(value: unknown): Gender | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'male' || normalized === 'female' || normalized === 'other' || normalized === 'prefer_not_to_say') {
    return normalized
  }
  return null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const meta = user.user_metadata ?? {}
    const setup = (meta.basic_profile_setup ?? null) as Record<string, unknown> | null
    const completed = Boolean(meta.basic_profile_setup_completed)

    const { data: donor } = await supabase
      .from('donors')
      .select('blood_group, last_donation_date')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      completed,
      profile_setup: {
        date_of_birth: setup?.date_of_birth ?? '',
        gender: setup?.gender ?? '',
        weight_kg: setup?.weight_kg ?? '',
        blood_group: donor?.blood_group ?? setup?.blood_group ?? '',
        city: setup?.city ?? '',
        pincode: setup?.pincode ?? '',
        last_donation_date: donor?.last_donation_date ?? setup?.last_donation_date ?? '',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load profile setup' }, { status: 500 })
  }
}

// POST /api/auth/profile – create or update profile after registration
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const normalizedGender = normalizeGender(body.gender)
    const normalizedWeight = typeof body.weight_kg === 'number'
      ? body.weight_kg
      : Number.parseFloat(String(body.weight_kg ?? ''))
    const hasWeight = Number.isFinite(normalizedWeight) && normalizedWeight > 0
    const normalizedPincode = typeof body.pincode === 'string' ? body.pincode.trim() : ''
    const normalizedCity = typeof body.city === 'string' ? body.city.trim() : ''
    const normalizedDob = typeof body.date_of_birth === 'string' ? body.date_of_birth : null
    const normalizedBloodGroup = typeof body.blood_group === 'string' ? body.blood_group : null
    const normalizedLastDonationDate = typeof body.last_donation_date === 'string' && body.last_donation_date
      ? body.last_donation_date
      : null

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('full_name, phone, role')
      .eq('id', user.id)
      .maybeSingle()

    const metadataName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split('@')[0] ||
      'User'

    const baseProfile = {
      id: user.id,
      full_name: body.full_name || existingProfile?.full_name || metadataName,
      phone: body.phone || existingProfile?.phone || '',
      email: user.email!,
      role: body.role ?? existingProfile?.role ?? 'both',
    }

    // Save required profile fields first so setup works even if optional DB columns are not present.
    const { data, error } = await supabase.from('profiles').upsert(baseProfile).select().single()

    if (error) throw error

    const optionalProfileUpdate: Record<string, unknown> = {
      date_of_birth: normalizedDob,
      gender: normalizedGender,
      weight_kg: hasWeight ? normalizedWeight : null,
      city: normalizedCity || null,
      pincode: normalizedPincode || null,
    }

    // Best-effort optional profile fields.
    const { error: optionalProfileErr } = await supabase
      .from('profiles')
      .update(optionalProfileUpdate)
      .eq('id', user.id)

    if (optionalProfileErr) {
      console.warn('[api/auth/profile] Optional profile column update skipped:', optionalProfileErr.message)
    }

    if (normalizedBloodGroup) {
      const { error: donorErr } = await supabase
        .from('donors')
        .upsert({
          user_id: user.id,
          blood_group: normalizedBloodGroup,
          last_donation_date: normalizedLastDonationDate,
          is_available: true,
        }, { onConflict: 'user_id' })

      if (donorErr) {
        console.warn('[api/auth/profile] Donor update skipped:', donorErr.message)
      }
    }

    const setupPayload = {
      date_of_birth: normalizedDob,
      gender: normalizedGender,
      weight_kg: hasWeight ? normalizedWeight : null,
      blood_group: normalizedBloodGroup,
      city: normalizedCity || null,
      pincode: normalizedPincode || null,
      last_donation_date: normalizedLastDonationDate,
    }

    const { error: metadataErr } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata ?? {}),
        basic_profile_setup_completed: true,
        basic_profile_setup: setupPayload,
      },
    })

    if (metadataErr) {
      console.warn('[api/auth/profile] Metadata update skipped:', metadataErr.message)
    }

    return NextResponse.json({ profile: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
