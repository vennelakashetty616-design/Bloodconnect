import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveEffectiveUser } from '@/lib/auth/devBypass'
import { BloodGroup } from '@/types'
import { getCompatibleDonorGroups } from '@/lib/matching'

// GET /api/matching?blood_group=O+&hospital_lat=...&hospital_lng=...&radius=10
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveUser = await resolveEffectiveUser(user)
    if (!effectiveUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const bloodGroup = searchParams.get('blood_group') as BloodGroup
    const hospitalLat = parseFloat(searchParams.get('hospital_lat') ?? '0')
    const hospitalLng = parseFloat(searchParams.get('hospital_lng') ?? '0')
    const radiusKm = parseFloat(searchParams.get('radius') ?? '10')

    if (!bloodGroup || !hospitalLat || !hospitalLng) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
    }

    const compatible = getCompatibleDonorGroups(bloodGroup)

    // Call the PostGIS function
    const { data: donors, error } = await supabase.rpc('find_nearby_donors', {
      p_blood_group: bloodGroup,
      p_hospital_lat: hospitalLat,
      p_hospital_lng: hospitalLng,
      p_radius_km: radiusKm,
      p_compatible_groups: compatible,
    })

    if (error) {
      // Fallback: simple query without geo functions
      console.warn('[matching] PostGIS RPC failed, using fallback:', error.message)
      const { data: fallback } = await supabase
        .from('donors')
        .select('*, profile:profiles!user_id(full_name, phone)')
        .in('blood_group', compatible)
        .eq('is_available', true)
        .limit(20)
      return NextResponse.json({ donors: fallback ?? [], fallback: true })
    }

    return NextResponse.json({ donors: donors ?? [] })
  } catch (err: any) {
    console.error('[GET /api/matching]', err)
    return NextResponse.json({ error: err.message ?? 'Failed to fetch donor matches' }, { status: 500 })
  }
}
