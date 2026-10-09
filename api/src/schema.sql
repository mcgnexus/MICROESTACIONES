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
  aemet_municipality_code text,
  aemet_station_id text,
  aemet_warning_area text,
  altitude integer CHECK (altitude IS NULL OR altitude BETWEEN -500 AND 9000),
  installation_date date,
  sensors jsonb NOT NULL DEFAULT '{"temperature":true,"humidity":true,"pressure":true,"battery":true,"lux":false}'::jsonb,
  firmware_version text,
  publish_permission boolean NOT NULL DEFAULT false,
  -- Documentación del emplazamiento y registro de verificación frente a una
  -- referencia: separan «aceptada por los controles automáticos» de «verificada».
  site_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
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
  -- Las cuentas de acceso sin contraseña no tienen hash: el login por contraseña
  -- sigue exigiéndolo, pero un alta por enlace no crea una.
  password_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer')),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  -- LEGADO: la autorización vigente vive en `consent_records`. Estas columnas se
  -- conservan para no perder datos al migrar, pero ya no son la fuente de verdad.
  communication_consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  pilot_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Verificación de la cuenta: instante en que se confirmó que el correo es del
  -- interesado (p. ej. al consumir un enlace de acceso). No implica publicidad.
  email_verified_at timestamptz,
  -- Origen de captación ya validado (utm_* limitados). No se guarda crudo.
  acquisition jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Unicidad insensible a mayúsculas y espacios: evita contactos duplicados por
  -- formato. La columna es generada, así que se mantiene sola en cada escritura.
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED
);

-- Perfil opcional del suscriptor. Es prescindible: entrar en la demo no depende
-- de rellenarlo. Reutiliza los mismos catálogos que la captación pública.
CREATE TABLE IF NOT EXISTS subscriber_profiles (
  subscriber_id bigint PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
  municipality text,
  activity text CHECK (activity IS NULL OR activity IN ('agricultura','ganaderia','mixta','otra')),
  crop_or_livestock text,
  interest text CHECK (interest IS NULL OR interest IN ('heladas','calor','tormentas','viento','humedad','general','futura_instalacion')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- El índice único sobre email_normalized lo crea migrate.js: en bases existentes
-- la columna generada se añade con un ALTER y allí se comprueba el resultado.
-- Los índices sobre columnas nuevas (role, is_validated, deleted_at, delivery_status)
-- los crea migrate.js tras los ALTER, porque en bases existentes estas tablas ya existen.

-- Enlaces de acceso de un solo uso. Se guarda solo el hash del token. El valor
-- en claro viaja una vez por email. Caduca y se consume con una única transición.
CREATE TABLE IF NOT EXISTS magic_links (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  return_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS magic_links_email_idx ON magic_links(email, created_at DESC);
CREATE INDEX IF NOT EXISTS magic_links_expiry_idx ON magic_links(expires_at);

CREATE TABLE IF NOT EXISTS subscriber_devices (
  subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  PRIMARY KEY (subscriber_id, device_id)
);

-- Finca: agrupa estaciones bajo un nombre que el cliente reconoce. La relación
-- finca-estación permite saber a qué finca pertenece cada aviso.
CREATE TABLE IF NOT EXISTS farms (
  id bigserial PRIMARY KEY,
  subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  name text NOT NULL,
  municipality text,
  latitude double precision,
  longitude double precision,
  crop text,
  livestock text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE TABLE IF NOT EXISTS farm_devices (
  farm_id bigint NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  PRIMARY KEY (farm_id, device_id)
);

-- Destinatario de avisos: un contacto por canal y suscriptor. `opted_in_at`
-- concede el envío y `opted_out_at` lo revoca. `verified_at` confirma que la
-- dirección es del propio interesado (OTP).
CREATE TABLE IF NOT EXISTS subscriber_contacts (
  id bigserial PRIMARY KEY,
  subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  address text NOT NULL,
  verified_at timestamptz,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, channel)
);

-- Código de verificación de un contacto. Solo se guarda el hash y el código viaja
-- una vez por el canal. Caduca y limita intentos para no servir de oráculo.
CREATE TABLE IF NOT EXISTS contact_verifications (
  id bigserial PRIMARY KEY,
  contact_id bigint NOT NULL REFERENCES subscriber_contacts(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_verifications_contact_idx ON contact_verifications(contact_id, created_at DESC);

-- Preferencias de alertas por usuario: qué categorías recibe, por qué canales,
-- horario silencioso y umbrales propios. Sin fila, se aplican los valores por defecto.
CREATE TABLE IF NOT EXISTS alert_preferences (
  subscriber_id bigint PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
  receive_frost boolean NOT NULL DEFAULT true,
  receive_heat boolean NOT NULL DEFAULT true,
  receive_storm boolean NOT NULL DEFAULT true,
  receive_wind boolean NOT NULL DEFAULT true,
  receive_humidity boolean NOT NULL DEFAULT true,
  receive_general boolean NOT NULL DEFAULT true,
  channel_whatsapp boolean NOT NULL DEFAULT true,
  channel_email boolean NOT NULL DEFAULT true,
  quiet_start time,
  quiet_end time,
  zone text,
  crop text,
  custom_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((quiet_start IS NULL AND quiet_end IS NULL) OR (quiet_start IS NOT NULL AND quiet_end IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash text PRIMARY KEY,
  subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_sessions_expiry_idx ON web_sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  limiter_key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS login_rate_limits_updated_idx ON login_rate_limits(updated_at);

-- Captación pública: una finca pide alertas sin tener cuenta todavía. El consentimiento
-- se guarda explícito y con fecha, y la cuenta se crea después, cuando el piloto avanza.
CREATE TABLE IF NOT EXISTS farm_leads (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  activity text NOT NULL DEFAULT 'agricultura' CHECK (activity IN ('agricultura','ganaderia','mixta','otra')),
  zone text,
  crop_or_livestock text,
  interest text CHECK (interest IS NULL OR interest IN ('heladas','calor','tormentas','viento','humedad','general','futura_instalacion')),
  notes text,
  admin_notes text,
  consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  status text NOT NULL DEFAULT 'nuevo'
    CHECK (status IN ('nuevo','contactado','interesado','piloto_activo','cliente','descartado')),
  source text NOT NULL DEFAULT 'web',
  -- Captación validada y seguimiento comercial del contacto.
  campaign jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_leads_status_idx ON farm_leads(status, created_at DESC);

CREATE TABLE IF NOT EXISTS metric_daily (
  day date NOT NULL, event text NOT NULL, bucket text NOT NULL,
  count integer NOT NULL CHECK (count > 0), PRIMARY KEY (day, event, bucket)
);
CREATE TABLE IF NOT EXISTS metric_milestones (
  id bigserial PRIMARY KEY,
  subscriber_id bigint REFERENCES subscribers(id) ON DELETE CASCADE,
  lead_id bigint REFERENCES farm_leads(id) ON DELETE CASCADE,
  event text NOT NULL,
  UNIQUE (subscriber_id, event), UNIQUE (lead_id, event),
  CHECK ((subscriber_id IS NULL) <> (lead_id IS NULL))
);

CREATE TABLE IF NOT EXISTS prospect_tracking (
  id bigserial PRIMARY KEY,
  subscriber_id bigint UNIQUE REFERENCES subscribers(id) ON DELETE CASCADE,
  lead_id bigint UNIQUE REFERENCES farm_leads(id) ON DELETE CASCADE,
  status text CHECK (status IN ('registrado','interes_declarado','contacto_solicitado','contactado','archivado')),
  notes text, next_action text, next_action_at timestamptz,
  installation_interest boolean, retain_until timestamptz,
  CHECK ((subscriber_id IS NULL) <> (lead_id IS NULL))
);

-- Libro de consentimientos: hechos inmutables con finalidad, canal, fecha y la
-- versión del texto aceptado. Un sujeto es o bien una cuenta o bien un contacto
-- de captación, nunca los dos. La publicidad vive aquí, separada del acceso.
CREATE TABLE IF NOT EXISTS consent_records (
  id bigserial PRIMARY KEY,
  subscriber_id bigint REFERENCES subscribers(id) ON DELETE CASCADE,
  lead_id bigint REFERENCES farm_leads(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('service','commercial')),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  text_version text NOT NULL,
  source text NOT NULL DEFAULT 'web',
  ip_address text,
  user_agent text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((subscriber_id IS NULL) <> (lead_id IS NULL))
);
CREATE INDEX IF NOT EXISTS consent_records_subject_idx
  ON consent_records(subscriber_id, lead_id, purpose, channel, recorded_at DESC);

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
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email','sms','webhook','push','in_app','whatsapp')),
  enabled boolean NOT NULL DEFAULT true,
  min_duration_s integer NOT NULL DEFAULT 0 CHECK (min_duration_s >= 0),
  recovery_margin double precision NOT NULL DEFAULT 0 CHECK (recovery_margin >= 0),
  urgent boolean NOT NULL DEFAULT false,
  -- Categoría del aviso: permite filtrar por preferencias del suscriptor.
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('frost','heat','storm','wind','humidity','general')),
  -- Cooldown: tras un aviso, no se repite hasta que pase este tiempo.
  cooldown_s integer NOT NULL DEFAULT 0 CHECK (cooldown_s >= 0),
  -- Recuperación explícita: umbral propio y tiempo que debe sostenerse para cerrar.
  recovery_threshold double precision,
  recovery_duration_s integer NOT NULL DEFAULT 0 CHECK (recovery_duration_s >= 0),
  -- Los detectores de sistema (sin comunicación, batería baja) son reglas
  -- sembradas que el servidor evalúa en su pasada periódica.
  system boolean NOT NULL DEFAULT false,
  condition_active boolean NOT NULL DEFAULT false,
  condition_since timestamptz,
  recovery_since timestamptz,
  active_alert_id bigint,
  last_alert_at timestamptz,
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
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('frost','heat','storm','wind','humidity','general')),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  -- Ciclo de vida del aviso: regla, destinatario, canal, entrega y cierre.
  rule_id bigint REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_snapshot jsonb,
  recipient text,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email','sms','webhook','push','in_app','whatsapp')),
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

CREATE TABLE IF NOT EXISTS external_weather_snapshots (
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('open_meteo','aemet')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  PRIMARY KEY (device_id, provider)
);

-- Serie histórica de observaciones AEMET, guardada al consultar el proveedor.
-- Permite comparar la microestación con AEMET a lo largo del tiempo, no solo en
-- la última lectura. Es dato externo: nunca sustituye a la medición local.
CREATE TABLE IF NOT EXISTS aemet_observations (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  station_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  temperature_c real,
  humidity_pct real,
  pressure_hpa real,
  precipitation_mm real,
  wind_kmh real,
  wind_gust_kmh real,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, station_id, observed_at)
);
CREATE INDEX IF NOT EXISTS aemet_observations_device_idx ON aemet_observations(device_id, observed_at DESC);

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

-- Cola de entrega de avisos y códigos. El aviso se guarda aunque falle el envío:
-- la fila conserva el intento, el proveedor y el error para poder reintentarlo.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('alert','contact_verification','lead_confirmation','lead_notice','commercial')),
  alert_id bigint REFERENCES alerts(id) ON DELETE CASCADE,
  contact_verification_id bigint REFERENCES contact_verifications(id) ON DELETE CASCADE,
  subscriber_id bigint REFERENCES subscribers(id) ON DELETE SET NULL,
  -- Un mensaje comercial puede ir a una cuenta o a un contacto de captación.
  lead_id bigint REFERENCES farm_leads(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  address text NOT NULL,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed','manual','cancelled','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- Exclusión entre trabajadores: quién ha reclamado la fila y desde cuándo. Un
   -- reclamo viejo se recupera. Nadie envía dos veces el mismo mensaje.
  claimed_by text,
  claimed_at timestamptz,
  -- Caducidad del mensaje: un aviso o un código viejo ya no se envía.
  expires_at timestamptz,
  last_error text,
  provider_message_id text,
  -- `sent_at` = aceptado por el proveedor (2xx). `delivered_at` = el proveedor
  -- confirmó la entrega por webhook. Son estados distintos y no se confunden.
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notification_outbox_alert_idx ON notification_outbox(alert_id);
-- El índice comercial lo crea migrate.js después de añadir lead_id, porque en
-- bases existentes esta tabla ya existe sin esa columna.
