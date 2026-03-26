-- ================================================================
--  BloodConnect – Supabase PostgreSQL Schema
--  Run this in Supabase SQL Editor (Database > SQL Editor)
-- ================================================================

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PROFILES ────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'donor' CHECK (role IN ('donor','requester','both')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile"  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- allow reading other profiles for matching UI
CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);

-- ─── DONORS ──────────────────────────────────────────────────────────────
CREATE TABLE donors (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blood_group         TEXT NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  last_donation_date  DATE,
  is_available        BOOLEAN DEFAULT TRUE,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  location            GEOGRAPHY(POINT, 4326),
  trust_score         NUMERIC(5,2) DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
  total_donations     INT DEFAULT 0,
  response_rate       NUMERIC(4,3) DEFAULT 0.5,
  response_history    JSONB DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Spatial index
CREATE INDEX donors_location_idx ON donors USING GIST (location);

ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Donors read own"  ON donors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Donors update own" ON donors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Donors insert own" ON donors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read donors" ON donors FOR SELECT USING (true);

-- Auto-update location geography column from lat/lng
CREATE OR REPLACE FUNCTION update_donor_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER donor_location_trigger
  BEFORE INSERT OR UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION update_donor_location();

-- ─── BLOOD REQUESTS ───────────────────────────────────────────────────────
CREATE TABLE blood_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id        UUID NOT NULL REFERENCES profiles(id),
  blood_group         TEXT NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  hospital_name       TEXT NOT NULL,
  hospital_address    TEXT NOT NULL,
  hospital_lat        DOUBLE PRECISION NOT NULL,
  hospital_lng        DOUBLE PRECISION NOT NULL,
  hospital_location   GEOGRAPHY(POINT, 4326),
  requester_lat       DOUBLE PRECISION NOT NULL,
  requester_lng       DOUBLE PRECISION NOT NULL,
  contact_number      TEXT NOT NULL,
  units_needed        INT DEFAULT 1,
  urgency             TEXT DEFAULT 'priority' CHECK (urgency IN ('emergency','priority','normal')),
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','matched','accepted','in_transit','arrived','completed','cancelled')),
  notes               TEXT,
  accepted_donor_id   UUID REFERENCES donors(id),
  vehicle_booking_id  UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX requests_status_idx ON blood_requests (status);
CREATE INDEX requests_blood_group_idx ON blood_requests (blood_group);
CREATE INDEX requests_hospital_loc_idx ON blood_requests USING GIST (hospital_location);

ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requester manages own requests" ON blood_requests
  USING (auth.uid() = requester_id);
CREATE POLICY "Public read active requests" ON blood_requests
  FOR SELECT USING (status NOT IN ('cancelled','completed'));

CREATE OR REPLACE FUNCTION update_request_hospital_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hospital_location = ST_SetSRID(
    ST_MakePoint(NEW.hospital_lng, NEW.hospital_lat), 4326
  )::geography;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER request_location_trigger
  BEFORE INSERT OR UPDATE ON blood_requests
  FOR EACH ROW EXECUTE FUNCTION update_request_hospital_location();

-- ─── DONOR LOCATIONS (real-time tracking) ─────────────────────────────────
CREATE TABLE donor_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id    UUID NOT NULL REFERENCES donors(id),
  request_id  UUID NOT NULL REFERENCES blood_requests(id),
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,
  speed_kmh   DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX donor_locations_request_idx ON donor_locations (request_id, timestamp DESC);

ALTER TABLE donor_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Donor inserts own location" ON donor_locations
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM donors WHERE id = donor_id)
  );
CREATE POLICY "Public read donor locations" ON donor_locations FOR SELECT USING (true);

-- ─── VEHICLE BOOKINGS ─────────────────────────────────────────────────────
CREATE TABLE vehicle_bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id      UUID NOT NULL REFERENCES blood_requests(id),
  donor_id        UUID NOT NULL REFERENCES donors(id),
  vehicle_type    TEXT NOT NULL CHECK (vehicle_type IN ('bike','cab')),
  driver_name     TEXT NOT NULL,
  driver_phone    TEXT NOT NULL,
  vehicle_number  TEXT NOT NULL,
  driver_lat      DOUBLE PRECISION NOT NULL,
  driver_lng      DOUBLE PRECISION NOT NULL,
  status          TEXT DEFAULT 'available' CHECK (status IN ('available','dispatched','arrived')),
  pickup_address  TEXT NOT NULL,
  pickup_lat      DOUBLE PRECISION NOT NULL,
  pickup_lng      DOUBLE PRECISION NOT NULL,
  booked_at       TIMESTAMPTZ DEFAULT NOW(),
  picked_up_at    TIMESTAMPTZ,
  arrived_at      TIMESTAMPTZ
);

ALTER TABLE vehicle_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read vehicle bookings" ON vehicle_bookings FOR SELECT USING (true);
CREATE POLICY "Authenticated insert vehicle" ON vehicle_bookings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- FK back to blood_requests
ALTER TABLE blood_requests
  ADD CONSTRAINT fk_vehicle_booking
  FOREIGN KEY (vehicle_booking_id) REFERENCES vehicle_bookings(id);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL,
  data        JSONB,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications" ON notifications
  USING (auth.uid() = user_id);

-- ─── REALTIME PUBLICATIONS ────────────────────────────────────────────────
-- Enable realtime for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE donor_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE blood_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ─── SPATIAL MATCHING FUNCTION ────────────────────────────────────────────
-- Finds donors within radius matching blood group + eligibility
CREATE OR REPLACE FUNCTION find_nearby_donors(
  p_blood_group       TEXT,
  p_hospital_lat      DOUBLE PRECISION,
  p_hospital_lng      DOUBLE PRECISION,
  p_radius_km         DOUBLE PRECISION DEFAULT 10,
  p_compatible_groups TEXT[]           DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
  donor_id          UUID,
  user_id           UUID,
  full_name         TEXT,
  blood_group       TEXT,
  distance_km       DOUBLE PRECISION,
  estimated_minutes DOUBLE PRECISION,
  trust_score       NUMERIC,
  total_donations   INT,
  last_donation_date DATE,
  is_available      BOOLEAN,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  phone             TEXT
) AS $$
DECLARE
  hospital_point GEOGRAPHY;
BEGIN
  hospital_point := ST_SetSRID(ST_MakePoint(p_hospital_lng, p_hospital_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    d.id                        AS donor_id,
    d.user_id,
    p.full_name,
    d.blood_group,
    ROUND((ST_Distance(d.location, hospital_point) / 1000.0)::NUMERIC, 2)::DOUBLE PRECISION AS distance_km,
    ROUND(((ST_Distance(d.location, hospital_point) / 1000.0) / 30.0 * 60)::NUMERIC, 1)::DOUBLE PRECISION AS estimated_minutes,
    d.trust_score,
    d.total_donations,
    d.last_donation_date,
    d.is_available,
    d.latitude,
    d.longitude,
    p.phone
  FROM donors d
  JOIN profiles p ON p.id = d.user_id
  WHERE
    d.location IS NOT NULL
    AND d.is_available = TRUE
    AND d.blood_group = ANY(
      CASE WHEN array_length(p_compatible_groups, 1) > 0
        THEN p_compatible_groups
        ELSE ARRAY[p_blood_group]
      END
    )
    AND (
      d.last_donation_date IS NULL
      OR d.last_donation_date <= CURRENT_DATE - INTERVAL '56 days'
    )
    AND ST_DWithin(d.location, hospital_point, p_radius_km * 1000)
  ORDER BY distance_km ASC, d.trust_score DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── SEED: Sample emergency vehicle drivers (demo) ────────────────────────
-- You can remove these in production and replace with real dispatch data
