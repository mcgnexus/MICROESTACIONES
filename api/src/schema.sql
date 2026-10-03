CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  name text NOT NULL,
  latitude double precision,
  longitude double precision,
  coverage_km double precision NOT NULL DEFAULT 25 CHECK (coverage_km > 0),
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE TABLE IF NOT EXISTS device_credentials (
  token_hash text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS measurements (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  sequence bigint NOT NULL CHECK (sequence BETWEEN 0 AND 4294967295),
  observed_at timestamptz NOT NULL,
  time_quality smallint NOT NULL DEFAULT 0 CHECK (time_quality BETWEEN 0 AND 3),
  temperature_c real CHECK (temperature_c BETWEEN -80 AND 100),
  humidity_pct real CHECK (humidity_pct BETWEEN 0 AND 100),
  pressure_pa integer CHECK (pressure_pa BETWEEN 30000 AND 120000),
  battery_mv integer CHECK (battery_mv BETWEEN 0 AND 6000),
  flags integer NOT NULL DEFAULT 0 CHECK (flags BETWEEN 0 AND 255),
  alert_level smallint NOT NULL DEFAULT 0 CHECK (alert_level BETWEEN 0 AND 2),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, sequence, observed_at)
);
CREATE INDEX IF NOT EXISTS measurements_device_time_idx ON measurements(device_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  measurement_id bigint REFERENCES measurements(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL UNIQUE,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 2),
  message text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'station_measurement' CHECK (source IN ('station_measurement','external_forecast','estimate')),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS alerts_device_time_idx ON alerts(device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_configs (
  device_id text PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriber_devices (
  subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  PRIMARY KEY (subscriber_id, device_id)
);
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash text PRIMARY KEY,
  subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_sessions_expiry_idx ON web_sessions(expires_at);

CREATE TABLE IF NOT EXISTS external_forecasts (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  provider text NOT NULL,
  forecast_for timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  temperature_c real,
  humidity_pct real,
  precipitation_mm real,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (device_id, provider, forecast_for)
);
