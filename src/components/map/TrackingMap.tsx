'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons in Next.js / webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom icons
const hospitalIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:36px;height:36px;background:#B11226;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);border:3px solid white;
    box-shadow:0 4px 12px rgba(177,18,38,0.5);
    display:flex;align-items:center;justify-content:center;
  ">
    <span style="transform:rotate(45deg);font-size:16px;line-height:1;">🏥</span>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
})

const donorIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:40px;height:40px;background:#ffffff;border-radius:50%;
    border:3px solid #C62828;box-shadow:0 2px 12px rgba(198,40,40,0.4);
    display:flex;align-items:center;justify-content:center;font-size:18px;
    animation:none;
  ">🦸</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

const vehicleIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:40px;height:40px;background:#C62828;border-radius:50%;
    border:3px solid white;box-shadow:0 2px 14px rgba(198,40,40,0.5);
    display:flex;align-items:center;justify-content:center;font-size:18px;
    position:relative;
  ">
    🚗
    <span style="
      position:absolute;top:-4px;right:-4px;width:12px;height:12px;
      background:#B11226;border-radius:50%;
      animation:pulse 1s ease-in-out infinite;
    "></span>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

interface MapAutoFitProps {
  positions: [number, number][]
}

function MapAutoFit({ positions }: MapAutoFitProps) {
  const map = useMap()
  useEffect(() => {
    if (positions.length >= 2) {
      const bounds = L.latLngBounds(positions.map((p) => L.latLng(p[0], p[1])))
      map.fitBounds(bounds, { padding: [40, 40] })
    } else if (positions.length === 1) {
      map.setView(positions[0], 15)
    }
  }, [positions, map])
  return null
}

export interface TrackingMapProps {
  hospitalLat: number
  hospitalLng: number
  donorLat?: number | null
  donorLng?: number | null
  vehicleLat?: number | null
  vehicleLng?: number | null
  hospitalName?: string
  donorName?: string
  radiusKm?: number
}

export default function TrackingMap({
  hospitalLat,
  hospitalLng,
  donorLat,
  donorLng,
  vehicleLat,
  vehicleLng,
  hospitalName = 'Hospital',
  donorName = 'Donor',
  radiusKm,
}: TrackingMapProps) {
  const positions: [number, number][] = [[hospitalLat, hospitalLng]]
  if (donorLat && donorLng) positions.push([donorLat, donorLng])
  if (vehicleLat && vehicleLng) positions.push([vehicleLat, vehicleLng])

  const routeLine: [number, number][] = []
  if (vehicleLat && vehicleLng) routeLine.push([vehicleLat, vehicleLng])
  if (donorLat && donorLng) routeLine.push([donorLat, donorLng])
  routeLine.push([hospitalLat, hospitalLng])

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <MapContainer
        center={[hospitalLat, hospitalLng]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        <MapAutoFit positions={positions} />

        {/* Search radius */}
        {radiusKm && (
          <Circle
            center={[hospitalLat, hospitalLng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#B11226',
              fillColor: '#C62828',
              fillOpacity: 0.05,
              weight: 1.5,
              dashArray: '6 4',
            }}
          />
        )}

        {/* Hospital marker */}
        <Marker position={[hospitalLat, hospitalLng]} icon={hospitalIcon}>
          <Popup>
            <div className="text-center font-bold text-trust-700 text-sm">{hospitalName}</div>
            <div className="text-xs text-gray-500 text-center">Destination</div>
          </Popup>
        </Marker>

        {/* Donor marker */}
        {donorLat && donorLng && (
          <Marker position={[donorLat, donorLng]} icon={donorIcon}>
            <Popup>
              <div className="text-center font-bold text-sm">{donorName}</div>
              <div className="text-xs text-trust-700 text-center">Heading to hospital</div>
            </Popup>
          </Marker>
        )}

        {/* Vehicle marker */}
        {vehicleLat && vehicleLng && (
          <Marker position={[vehicleLat, vehicleLng]} icon={vehicleIcon}>
            <Popup>
              <div className="text-center font-bold text-trust-700 text-sm">Driver Vehicle</div>
              <div className="text-xs text-gray-500 text-center">Heading on assigned ride</div>
            </Popup>
          </Marker>
        )}

        {/* Route line */}
        {routeLine.length >= 2 && (
          <Polyline
            positions={routeLine}
            pathOptions={{
              color: '#B11226',
              weight: 3.5,
              opacity: 0.75,
              dashArray: '8 6',
            }}
          />
        )}
      </MapContainer>

      {/* Overlay: live indicator */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow text-xs font-bold text-trust-700">
        <span className="w-2 h-2 rounded-full bg-care-500 animate-pulse" />
        LIVE
      </div>
    </div>
  )
}
