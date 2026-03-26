import { NextRequest, NextResponse } from 'next/server'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const HEADERS = {
  'User-Agent': 'FuelLife/1.0 (blood emergency app)',
  'Accept-Language': 'en',
  'Referer': 'https://fuellife.app',
}

// GET /api/geocode?q=address          → forward geocode
// GET /api/geocode?lat=X&lng=Y        → reverse geocode
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q   = searchParams.get('q')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  try {
    if (lat && lng) {
      // Reverse geocode
      const url = `${NOMINATIM}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json`
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } })
      if (!res.ok) return NextResponse.json({ error: 'Geocode failed' }, { status: 502 })
      const data = await res.json()
      return NextResponse.json({ display_name: data.display_name ?? null })
    }

    if (q) {
      // Forward geocode
      const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } })
      if (!res.ok) return NextResponse.json({ error: 'Geocode failed' }, { status: 502 })
      const data = await res.json()
      if (!data.length) return NextResponse.json({ lat: null, lng: null })
      return NextResponse.json({
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name,
      })
    }

    return NextResponse.json({ error: 'Provide q= or lat=&lng= params' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
