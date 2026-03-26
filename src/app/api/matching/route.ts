import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BloodGroup } from '@/types'
import { getCompatibleDonorGroups } from '@/lib/matching'

// Demo donors for unauthorized/demo mode
const DEMO_DONORS = [
  {
    donor_id: 'demo-1',
    full_name: 'Arjun Mehta',
    blood_group: 'O+' as BloodGroup,
    trust_score: 92,
    distance_km: 2.1,
    estimated_minutes: 6,
  },
  {
    donor_id: 'demo-2',
    full_name: 'Priya Sharma',
    blood_group: 'O+' as BloodGroup,
    trust_score: 88,
    distance_km: 4.5,
    estimated_minutes: 11,
  },
  {
    donor_id: 'demo-3',
    full_name: 'Raj Kumar',
    blood_group: 'O+' as BloodGroup,
    trust_score: 95,
    distance_km: 3.8,
    estimated_minutes: 9,
  },
  {
    donor_id: 'demo-4',
    full_name: 'Kavya Patel',
    blood_group: 'O+' as BloodGroup,
    trust_score: 85,
    distance_km: 5.2,
    estimated_minutes: 14,
  },
  {
    donor_id: 'demo-5',
    full_name: 'Arun Singh',
    blood_group: 'O+' as BloodGroup,
    trust_score: 90,
    distance_km: 6.1,
    estimated_minutes: 17,
  },
]

// GET /api/matching?blood_group=O+&hospital_lat=...&hospital_lng=...&radius=10
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    // Demo mode: return demo donors for unauthorized users
    if (!user) {
      return NextResponse.json({ donors: DEMO_DONORS, demo: true })
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
    // Return demo donors on error instead of 500
    return NextResponse.json({ donors: DEMO_DONORS, demo: true })
  }
}
