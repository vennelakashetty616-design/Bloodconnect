import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BookVehiclePayload } from '@/types'

// Simulated dispatch pool (in production this would connect to a real dispatch system)
const EMERGENCY_DRIVERS = [
  {
    driver_name: 'Rajesh Kumar',
    driver_phone: '+91-9876543210',
    vehicle_number: 'BC-BIKE-001',
    type: 'bike',
    lat: 0, lng: 0, // will be offset from donor
  },
  {
    driver_name: 'Priya Singh',
    driver_phone: '+91-9876543211',
    vehicle_number: 'BC-CAB-002',
    type: 'cab',
    lat: 0, lng: 0,
  },
  {
    driver_name: 'Arjun Sharma',
    driver_phone: '+91-9876543212',
    vehicle_number: 'BC-BIKE-003',
    type: 'bike',
    lat: 0, lng: 0,
  },
  {
    driver_name: 'Meena Patel',
    driver_phone: '+91-9876543213',
    vehicle_number: 'BC-CAB-004',
    type: 'cab',
    lat: 0, lng: 0,
  },
]

// POST /api/vehicles – book an emergency vehicle
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: BookVehiclePayload = await req.json()

    if (!body.request_id || !body.donor_id || !body.vehicle_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Select a random available driver of the right type
    const pool = EMERGENCY_DRIVERS.filter((d) => d.type === body.vehicle_type)
    const driver = pool[Math.floor(Math.random() * pool.length)]

    // Simulate driver near donor location (within 1-2 km)
    const latOffset = (Math.random() - 0.5) * 0.018 // ~1km
    const lngOffset = (Math.random() - 0.5) * 0.018

    const { data: booking, error } = await supabase
      .from('vehicle_bookings')
      .insert({
        request_id: body.request_id,
        donor_id: body.donor_id,
        vehicle_type: body.vehicle_type,
        driver_name: driver.driver_name,
        driver_phone: driver.driver_phone,
        vehicle_number: driver.vehicle_number,
        driver_lat: body.pickup_lat + latOffset,
        driver_lng: body.pickup_lng + lngOffset,
        status: 'dispatched',
        pickup_address: body.pickup_address,
        pickup_lat: body.pickup_lat,
        pickup_lng: body.pickup_lng,
      })
      .select()
      .single()

    if (error) throw error

    // Link booking to request
    await supabase
      .from('blood_requests')
      .update({ vehicle_booking_id: booking.id })
      .eq('id', body.request_id)

    // Notify requester
    const { data: reqData } = await supabase
      .from('blood_requests')
      .select('requester_id')
      .eq('id', body.request_id)
      .single()

    if (reqData) {
      await supabase.from('notifications').insert({
        user_id: reqData.requester_id,
        title: `🚑 FuelLife ${body.vehicle_type === 'bike' ? 'Bike' : 'Cab'} Dispatched`,
        body: `${driver.driver_name} is picking up your donor and heading to the hospital.`,
        type: 'emergency',
        data: { request_id: body.request_id, booking_id: booking.id },
      })
    }

    return NextResponse.json({ booking }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/vehicles]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/vehicles?request_id=xxx
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('request_id')

    if (!requestId) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })

    const { data, error } = await supabase
      .from('vehicle_bookings')
      .select('*')
      .eq('request_id', requestId)
      .order('booked_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return NextResponse.json({ booking: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
