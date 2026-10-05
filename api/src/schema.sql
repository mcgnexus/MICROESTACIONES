-- Esquema TECRURAL · instalación limpia. Las mejoras incremental se aplican en
-- migrate.js (ALTER ... IF NOT EXISTS) para bases de datos ya existentes.

CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  name text NOT NULL,
  latitude double precision,
  longitude double precision,
  coverage_km double precision NOT NULL DEFAULT 25 CHECK (coverage_km > 0),
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Identidad operativa de la estación.
  owner text,
  location_type text NOT NULL DEFAULT 'finca' CHECK (location_type IN ('urbano','finca','otro')),
  public_zone text,
  altitude integer CHECK (altitude IS NULL OR altitude BETWEEN -500 AND 9000),
  installation_date date,
  sensors jsonb NOT NULL DEFAULT '{"temperature":true,"humidity":true,"pressure":true,"battery":true,"lux":false}'::jsonb,
  firmware_version text,
  publish_permission boolean NOT NULL DEFAULT false,
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE TABLE IF NOT EXISTS device_credentials (
  token_hash text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS subscribers (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer')),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  communication_consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  pilot_requests jsonb NOT NULL DEFAULT '[]'::jsonb
);
-- Los índices sobre columnas nuevas (role, is_validated, deleted_at, delivery_status)
-- los crea migrate.js tras los ALTER, porque en bases existentes estas tablas ya existen.

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

-- Cada fila conserva lo que el equipo transmitió: instante de medida (observed_at)
-- e instante de recepción (received_at) son distintos para reconstruir lotes tardíos.
-- is_validated separa el valor recibido del dato validado. Los invalidados nunca se
-- borran (se conservan raw_payload/flags) y quedan fuera de las estadísticas.
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
  lux real CHECK (lux BETWEEN 0 AND 200000),
  flags integer NOT NULL DEFAULT 0 CHECK (flags BETWEEN 0 AND 255),
  alert_level smallint NOT NULL DEFAULT 0 CHECK (alert_level BETWEEN 0 AND 2),
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'wifi' CHECK (source IN ('wifi','lora')),
  is_validated boolean NOT NULL DEFAULT true,
  validation_flags integer NOT NULL DEFAULT 0,
  raw_payload jsonb,
  validated_by bigint REFERENCES subscribers(id),
  validated_at timestamptz,
  invalidated_reason text,
  deleted_at timestamptz,
  deleted_by bigint REFERENCES subscribers(id),
  UNIQUE (device_id, sequence, observed_at)
);
CREATE INDEX IF NOT EXISTS measurements_device_time_idx ON measurements(device_id, observed_at DESC);

-- Umbrales de medición: la regla que originó un aviso.
-- min_duration_s exige que la condición se sostenga, recovery_margin evita el
-- baile alrededor del umbral y urgent marca la excepción de envío inmediato.
-- condition_* guardan el estado de la condición entre lotes (una por regla).
CREATE TABLE IF NOT EXISTS alert_rules (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('temperature','humidity','pressure','battery','lux','connectivity')),
  comparator text NOT NULL CHECK (comparator IN ('gt','gte','lt','lte')),
  threshold double precision NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 2),
  message text NOT NULL,
  recipient text,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email','sms','webhook','push','in_app')),
  enabled boolean NOT NULL DEFAULT true,
  min_duration_s integer NOT NULL DEFAULT 0 CHECK (min_duration_s >= 0),
  recovery_margin double precision NOT NULL DEFAULT 0 CHECK (recovery_margin >= 0),
  urgent boolean NOT NULL DEFAULT false,
  -- Los detectores de sistema (sin comunicación, batería baja) son reglas
  -- sembradas que el servidor evalúa en su pasada periódica.
  system boolean NOT NULL DEFAULT false,
  condition_active boolean NOT NULL DEFAULT false,
  condition_since timestamptz,
  active_alert_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, metric, comparator, threshold)
);
CREATE INDEX IF NOT EXISTS alert_rules_device_idx ON alert_rules(device_id);

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
  acknowledged_at timestamptz,
  -- Ciclo de vida del aviso: regla, destinatario, canal, entrega y cierre.
  rule_id bigint REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_snapshot jsonb,
  recipient text,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email','sms','webhook','push','in_app')),
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','delivered','failed','bounced')),
  delivered_at timestamptz,
  closed_at timestamptz,
  closed_by bigint REFERENCES subscribers(id),
  closure_reason text,
  -- Cerrado por el motor al recuperarse la condición, sin intervención humana.
  auto_resolved boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS alerts_device_time_idx ON alerts(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts(device_id, level) WHERE closed_at IS NULL;

-- Excepción urgente: el servidor pide al equipo que suba la medida crítica en
-- este despertar. Se libera cuando llega el siguiente envío, y sirve para medir
-- el coste real en batería antes de asumirlo.
CREATE TABLE IF NOT EXISTS urgent_directives (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  rule_id bigint REFERENCES alert_rules(id) ON DELETE SET NULL,
  reason text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  battery_mv_before integer,
  battery_mv_after integer
);
CREATE INDEX IF NOT EXISTS urgent_directives_device_idx ON urgent_directives(device_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS device_configs (
  device_id text PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Historial versionado: quién cambió qué, qué versión pidió y confirmó el equipo.
CREATE TABLE IF NOT EXISTS device_config_versions (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  config jsonb NOT NULL,
  requested_version integer,
  requested_at timestamptz,
  confirmed_version integer,
  changed_by bigint REFERENCES subscribers(id),
  change_reason text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, version)
);
CREATE INDEX IF NOT EXISTS device_config_versions_device_idx ON device_config_versions(device_id, version DESC);

-- Estado operativo: último contacto, último dato válido, conectividad y pendientes.
CREATE TABLE IF NOT EXISTS device_status (
  device_id text PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  last_contact timestamptz,
  last_valid_data timestamptz,
  connectivity text NOT NULL DEFAULT 'unknown' CHECK (connectivity IN ('online','degraded','offline','unknown')),
  battery_mv integer,
  battery_level text NOT NULL DEFAULT 'unknown' CHECK (battery_level IN ('ok','low','critical','unknown')),
  firmware_version text,
  config_version integer NOT NULL DEFAULT 0,
  pending_samples integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS station_sensors (
  id text PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL,
  min_value real,
  max_value real,
  description text,
  is_core boolean NOT NULL DEFAULT false
);
INSERT INTO station_sensors (id, name, unit, min_value, max_value, description, is_core) VALUES
  ('temperature','Temperatura','°C',-80,100,'Temperatura ambiente',true),
  ('humidity','Humedad','%',0,100,'Humedad relativa',true),
  ('pressure','Presión','Pa',30000,120000,'Presión atmosférica',true),
  ('battery','Batería','mV',0,6000,'Voltaje de batería',true),
  ('lux','Iluminancia','lux',0,200000,'Radiación luminosa (canal opcional)',false)
ON CONFLICT (id) DO NOTHING;

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

-- Trazabilidad de cambios sensibles (configuración, permisos, validaciones).
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id bigint REFERENCES subscribers(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  before_json jsonb,
  after_json jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs(target_type, target_id, created_at DESC);
