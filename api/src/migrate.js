import { readFile } from 'node:fs/promises';
import { sql } from './db.js';
import { evaluateWriteTarget, reportWriteTarget } from './env-guard.js';

// La migración escribe esquema: no debe ejecutarse por accidente sobre producción.
if (reportWriteTarget('migración', evaluateWriteTarget())) process.exit(1);

// Mejoras incrementales: cada sentencia es idempotente para bases existentes.
// En instalación limpia schema.sql ya trae las columnas y los ALTER se saltan.
const upgrades = [
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS owner text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'finca' CHECK (location_type IN ('urbano','finca','otro'))`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS public_zone text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS aemet_municipality_code text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS aemet_station_id text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS aemet_warning_area text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS altitude integer CHECK (altitude IS NULL OR altitude BETWEEN -500 AND 9000)`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS installation_date date`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS sensors jsonb NOT NULL DEFAULT '{"temperature":true,"humidity":true,"pressure":true,"battery":true,"lux":false}'::jsonb`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS publish_permission boolean NOT NULL DEFAULT false`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS site_info jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS verification jsonb NOT NULL DEFAULT '{}'::jsonb`,

  // Reglas de aviso primero: alerts hace referencia a ellas.
  `DO $$ BEGIN
     CREATE TABLE alert_rules (
       id bigserial PRIMARY KEY,
       device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       metric text NOT NULL CHECK (metric IN ('temperature','humidity','pressure','battery','lux')),
       comparator text NOT NULL CHECK (comparator IN ('gt','gte','lt','lte')),
       threshold double precision NOT NULL,
       level smallint NOT NULL CHECK (level BETWEEN 1 AND 2),
       message text NOT NULL,
       recipient text,
       channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email','sms','webhook','push','in_app')),
       enabled boolean NOT NULL DEFAULT true,
       created_at timestamptz NOT NULL DEFAULT now(),
       UNIQUE (device_id, metric, comparator, threshold)
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,

  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS lux real CHECK (lux BETWEEN 0 AND 200000)`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'wifi' CHECK (source IN ('wifi','lora'))`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS is_validated boolean NOT NULL DEFAULT true`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS validation_flags integer NOT NULL DEFAULT 0`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS raw_payload jsonb`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS validated_by bigint REFERENCES subscribers(id)`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS validated_at timestamptz`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS invalidated_reason text`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS deleted_at timestamptz`,
  `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS deleted_by bigint REFERENCES subscribers(id)`,

  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS rule_id bigint`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS rule_snapshot jsonb`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS recipient text`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email','sms','webhook','push','in_app'))`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','delivered','failed','bounced'))`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS delivered_at timestamptz`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS closed_at timestamptz`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS closed_by bigint REFERENCES subscribers(id)`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS closure_reason text`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS auto_resolved boolean NOT NULL DEFAULT false`,

  // Motor de avisos verificable: duración mínima, margen de recuperación y
  // excepción urgente. El estado de la condición persiste entre lotes.
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS min_duration_s integer NOT NULL DEFAULT 0 CHECK (min_duration_s >= 0)`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS recovery_margin double precision NOT NULL DEFAULT 0 CHECK (recovery_margin >= 0)`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS system boolean NOT NULL DEFAULT false`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS condition_active boolean NOT NULL DEFAULT false`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS condition_since timestamptz`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS active_alert_id bigint`,
  `ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_metric_check`,
  `ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_metric_check
     CHECK (metric IN ('temperature','humidity','pressure','battery','lux','connectivity'))`,
  // El canal WhatsApp se suma a los canales de aviso existentes.
  `ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_channel_check`,
  `ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_channel_check
     CHECK (channel IN ('email','sms','webhook','push','in_app','whatsapp'))`,
  `ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_channel_check`,
  `ALTER TABLE alerts ADD CONSTRAINT alerts_channel_check
     CHECK (channel IN ('email','sms','webhook','push','in_app','whatsapp'))`,
  `CREATE INDEX IF NOT EXISTS alert_rules_device_idx ON alert_rules(device_id)`,
  `CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts(device_id, level) WHERE closed_at IS NULL`,

  // Peticiones de envío urgente y su medición de coste en batería.
  `DO $$ BEGIN
     CREATE TABLE urgent_directives (
       id bigserial PRIMARY KEY,
       device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       rule_id bigint REFERENCES alert_rules(id) ON DELETE SET NULL,
       reason text NOT NULL,
       issued_at timestamptz NOT NULL DEFAULT now(),
       released_at timestamptz,
       battery_mv_before integer,
       battery_mv_after integer
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS urgent_directives_device_idx ON urgent_directives(device_id, issued_at DESC)`,

  // Detectores de sistema: sin comunicación y batería baja.
  `INSERT INTO alert_rules (device_id, metric, comparator, threshold, level, message, channel, enabled,
       system, min_duration_s, recovery_margin)
     SELECT d.id, 'connectivity', 'gt', 1800, 1, 'Estación sin comunicación', 'in_app', true, true, 0, 60
     FROM devices d WHERE NOT EXISTS (
       SELECT 1 FROM alert_rules r WHERE r.device_id = d.id AND r.metric = 'connectivity')`,
  `INSERT INTO alert_rules (device_id, metric, comparator, threshold, level, message, channel, enabled,
       system, min_duration_s, recovery_margin)
     SELECT d.id, 'battery', 'lt', 3400, 2, 'Batería por debajo del umbral configurado', 'in_app', true, true, 0, 100
     FROM devices d WHERE NOT EXISTS (
       SELECT 1 FROM alert_rules r WHERE r.device_id = d.id AND r.metric = 'battery' AND r.system)`,
  `DO $$ BEGIN
     ALTER TABLE alerts ADD CONSTRAINT alerts_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES alert_rules(id);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer'))`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise'))`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS communication_consent boolean NOT NULL DEFAULT false`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS consent_at timestamptz`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS pilot_requests jsonb NOT NULL DEFAULT '[]'::jsonb`,

  // Acceso sin contraseña: la cuenta puede no tener hash y el email es único
  // ignorando mayúsculas/espacios. Si ya hubiera duplicados normalizados, el
  // índice falla y obliga a resolverlos a mano antes de continuar.
  `ALTER TABLE subscribers ALTER COLUMN password_hash DROP NOT NULL`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED`,
  `CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_normalized_idx ON subscribers(email_normalized)`,
  `DO $$ BEGIN
     CREATE TABLE magic_links (
       id bigserial PRIMARY KEY,
       email text NOT NULL,
       token_hash text NOT NULL UNIQUE,
       return_path text,
       created_at timestamptz NOT NULL DEFAULT now(),
       expires_at timestamptz NOT NULL,
       consumed_at timestamptz
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS magic_links_email_idx ON magic_links(email, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS magic_links_expiry_idx ON magic_links(expires_at)`,
  // El enlace de acceso puede recoger, por separado, el consentimiento publicitario
  // y el origen de captación; se aplican a la cuenta cuando se verifica.
  `ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS commercial_consent boolean NOT NULL DEFAULT false`,
  `ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS acquisition jsonb NOT NULL DEFAULT '{}'::jsonb`,

  // Cuenta verificada, perfil opcional y libro de consentimientos. Separa el
  // acceso (cuenta) del permiso publicitario (consent_records).
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS acquisition jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `DO $$ BEGIN
     CREATE TABLE subscriber_profiles (
       subscriber_id bigint PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
       municipality text,
       activity text CHECK (activity IS NULL OR activity IN ('agricultura','ganaderia','mixta','otra')),
       crop_or_livestock text,
       interest text CHECK (interest IS NULL OR interest IN ('heladas','calor','tormentas','viento','humedad','general','futura_instalacion')),
       updated_at timestamptz NOT NULL DEFAULT now()
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  // El catálogo de interés creció (futura_instalacion): se refresca el CHECK
  // porque en bases existentes la tabla ya estaba creada con la lista anterior.
  `ALTER TABLE subscriber_profiles DROP CONSTRAINT IF EXISTS subscriber_profiles_interest_check`,
  `DO $$ BEGIN
     ALTER TABLE subscriber_profiles ADD CONSTRAINT subscriber_profiles_interest_check
       CHECK (interest IS NULL OR interest IN ('heladas','calor','tormentas','viento','humedad','general','futura_instalacion'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TABLE consent_records (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS consent_records_subject_idx
     ON consent_records(subscriber_id, lead_id, purpose, channel, recorded_at DESC)`,

  // Captación pública de fincas: alta sin cuenta, revisada por administración.
  `DO $$ BEGIN
     CREATE TABLE farm_leads (
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
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS farm_leads_status_idx ON farm_leads(status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS prospect_tracking (
    id bigserial PRIMARY KEY,
    subscriber_id bigint UNIQUE REFERENCES subscribers(id) ON DELETE CASCADE,
    lead_id bigint UNIQUE REFERENCES farm_leads(id) ON DELETE CASCADE,
    status text CHECK (status IN ('registrado','interes_declarado','contacto_solicitado','contactado','archivado')),
    notes text, next_action text, next_action_at timestamptz,
    installation_interest boolean, retain_until timestamptz,
    CHECK ((subscriber_id IS NULL) <> (lead_id IS NULL)))`,
  `ALTER TABLE farm_leads ADD COLUMN IF NOT EXISTS campaign jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE farm_leads ADD COLUMN IF NOT EXISTS next_contact_at timestamptz`,

  // Migración de la solicitud antigua (municipality/farm_type/crop, estados en inglés)
  // al modelo de leads actual, conservando los datos ya recibidos.
  `ALTER TABLE farm_leads ADD COLUMN IF NOT EXISTS email text`,
  `ALTER TABLE farm_leads ADD COLUMN IF NOT EXISTS interest text`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_leads' AND column_name = 'municipality')
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_leads' AND column_name = 'zone') THEN
       ALTER TABLE farm_leads RENAME COLUMN municipality TO zone;
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_leads' AND column_name = 'farm_type')
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_leads' AND column_name = 'activity') THEN
       ALTER TABLE farm_leads RENAME COLUMN farm_type TO activity;
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_leads' AND column_name = 'crop')
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_leads' AND column_name = 'crop_or_livestock') THEN
       ALTER TABLE farm_leads RENAME COLUMN crop TO crop_or_livestock;
     END IF;
   END $$`,
  `ALTER TABLE farm_leads DROP CONSTRAINT IF EXISTS farm_leads_farm_type_check`,
  `ALTER TABLE farm_leads DROP CONSTRAINT IF EXISTS farm_leads_activity_check`,
  `ALTER TABLE farm_leads DROP CONSTRAINT IF EXISTS farm_leads_status_check`,
  `ALTER TABLE farm_leads DROP CONSTRAINT IF EXISTS farm_leads_interest_check`,
  `UPDATE farm_leads SET activity = 'otra' WHERE activity = 'otro'`,
  `UPDATE farm_leads SET status = 'nuevo' WHERE status = 'new'`,
  `UPDATE farm_leads SET status = 'contactado' WHERE status = 'contacted'`,
  `UPDATE farm_leads SET status = 'piloto_activo' WHERE status = 'activated'`,
  `UPDATE farm_leads SET status = 'descartado' WHERE status = 'rejected'`,
  `ALTER TABLE farm_leads ALTER COLUMN status SET DEFAULT 'nuevo'`,
  `DO $$ BEGIN
     ALTER TABLE farm_leads ADD CONSTRAINT farm_leads_activity_check
       CHECK (activity IN ('agricultura','ganaderia','mixta','otra'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE farm_leads ADD CONSTRAINT farm_leads_status_check
       CHECK (status IN ('nuevo','contactado','interesado','piloto_activo','cliente','descartado'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE farm_leads ADD CONSTRAINT farm_leads_interest_check
       CHECK (interest IS NULL OR interest IN ('heladas','calor','tormentas','viento','humedad','general','futura_instalacion'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Finca, estaciones asociadas y destinatarios de avisos.
  `DO $$ BEGIN
     CREATE TABLE farms (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TABLE farm_devices (
       farm_id bigint NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
       device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       PRIMARY KEY (farm_id, device_id)
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TABLE subscriber_contacts (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TABLE contact_verifications (
       id bigserial PRIMARY KEY,
       contact_id bigint NOT NULL REFERENCES subscriber_contacts(id) ON DELETE CASCADE,
       code_hash text NOT NULL,
       expires_at timestamptz NOT NULL,
       attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
       consumed_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now()
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS contact_verifications_contact_idx ON contact_verifications(contact_id, created_at DESC)`,
  `DO $$ BEGIN
     CREATE TABLE notification_outbox (
       id bigserial PRIMARY KEY,
       kind text NOT NULL CHECK (kind IN ('alert','contact_verification')),
       alert_id bigint REFERENCES alerts(id) ON DELETE CASCADE,
       contact_verification_id bigint REFERENCES contact_verifications(id) ON DELETE CASCADE,
       subscriber_id bigint REFERENCES subscribers(id) ON DELETE SET NULL,
       channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
       address text NOT NULL,
       subject text,
       body text NOT NULL,
       status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed')),
       attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
       next_attempt_at timestamptz NOT NULL DEFAULT now(),
       last_error text,
       provider_message_id text,
       sent_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS notification_outbox_alert_idx ON notification_outbox(alert_id)`,
  // La cola de entrega también admite la confirmación al visitante, el aviso
  // interno y los mensajes comerciales (novedades y ofertas).
  `ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS lead_id bigint REFERENCES farm_leads(id) ON DELETE SET NULL`,
  `ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_kind_check`,
  `DO $$ BEGIN
     ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_kind_check
       CHECK (kind IN ('alert','contact_verification','lead_confirmation','lead_notice','commercial'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Modo piloto: el WhatsApp se envía a mano, así que el envío queda en 'manual'.
  // 'cancelled' aparta un mensaje comercial cuando se revoca el consentimiento.
  // 'expired' lo aparta cuando ha caducado: nunca se envía un aviso viejo.
  `ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_status_check`,
  `DO $$ BEGIN
     ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check
       CHECK (status IN ('pending','sending','sent','delivered','failed','manual','cancelled','expired'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Exclusión entre trabajadores, caducidad y separación entre "aceptado por el
  // proveedor" (sent_at) y "entregado" (delivered_at, por webhook).
  `ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS claimed_by text`,
  `ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz`,
  `ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS expires_at timestamptz`,
  `ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS delivered_at timestamptz`,
  // Rezonda lo que ya estaba en cola sin caducidad: un aviso o un código viejo
  // no se envía. Solo se rellena lo que sigue pendiente.
  `UPDATE notification_outbox SET expires_at = created_at + CASE kind
      WHEN 'alert' THEN interval '4 hours'
      WHEN 'contact_verification' THEN interval '15 minutes'
      ELSE interval '7 days' END
    WHERE expires_at IS NULL AND status IN ('pending','sending','manual')`,
  `CREATE INDEX IF NOT EXISTS notification_outbox_commercial_idx
     ON notification_outbox(subscriber_id, lead_id, channel) WHERE kind = 'commercial'`,
  `CREATE INDEX IF NOT EXISTS notification_outbox_claim_idx
     ON notification_outbox(status, claimed_at) WHERE status = 'sending'`,
  `CREATE INDEX IF NOT EXISTS notification_outbox_expiry_idx
     ON notification_outbox(expires_at) WHERE status IN ('pending','sending')`,

  // Diseño de alertas: categoría, cooldown, recuperación explícita y último aviso.
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS cooldown_s integer NOT NULL DEFAULT 0`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS recovery_threshold double precision`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS recovery_duration_s integer NOT NULL DEFAULT 0`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS recovery_since timestamptz`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS last_alert_at timestamptz`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'`,
  `ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_category_check`,
  `DO $$ BEGIN
     ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_category_check
       CHECK (category IN ('frost','heat','storm','wind','humidity','general'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_category_check`,
  `DO $$ BEGIN
     ALTER TABLE alerts ADD CONSTRAINT alerts_category_check
       CHECK (category IN ('frost','heat','storm','wind','humidity','general'));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Preferencias de alertas por usuario.
  `DO $$ BEGIN
     CREATE TABLE alert_preferences (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,

  `CREATE INDEX IF NOT EXISTS measurements_validated_idx ON measurements(device_id, observed_at DESC) WHERE is_validated = true`,
  `CREATE INDEX IF NOT EXISTS measurements_deleted_idx ON measurements(deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS subscribers_role_idx ON subscribers(role)`,
  `CREATE INDEX IF NOT EXISTS alerts_delivery_idx ON alerts(delivery_status) WHERE delivery_status <> 'delivered'`,
  `CREATE TABLE IF NOT EXISTS external_weather_snapshots (
    device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('open_meteo','aemet')),
    fetched_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL,
    PRIMARY KEY (device_id, provider)
  )`,
  // Serie histórica de observaciones AEMET para la comparación temporal.
  `DO $$ BEGIN
     CREATE TABLE aemet_observations (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS aemet_observations_device_idx ON aemet_observations(device_id, observed_at DESC)`,
  // Trazabilidad de la normalización AEMET: valor original de `fint` y regla
  // aplicada. Sin ellos no puede corregirse una hora antigua con evidencia.
  `ALTER TABLE aemet_observations ADD COLUMN IF NOT EXISTS raw_fint text`,
  `ALTER TABLE aemet_observations ADD COLUMN IF NOT EXISTS date_rule text`,

  // Instalaciones: la estación puede trasladarse; cada muestra se asocia a su
  // instalación por rango temporal (no se toca `measurements`).
  `DO $$ BEGIN
     CREATE TABLE installations (
       id bigserial PRIMARY KEY,
       device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       site_name text,
       location_type text CHECK (location_type IS NULL OR location_type IN ('urbano','finca','otro')),
       zone text,
       latitude double precision,
       longitude double precision,
       altitude integer,
       height_m numeric,
       shelter text,
       maintenance jsonb NOT NULL DEFAULT '[]'::jsonb,
       notes text,
       started_at timestamptz NOT NULL DEFAULT now(),
       ended_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       CHECK (ended_at IS NULL OR ended_at >= started_at),
       CHECK ((latitude IS NULL AND longitude IS NULL) OR
              (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS installations_open_device_idx ON installations(device_id) WHERE ended_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS installations_device_idx ON installations(device_id, started_at DESC)`,

  // Servicios contratados: estado del piloto, oferta acordada y condiciones.
  `DO $$ BEGIN
     CREATE TABLE services (
       id bigserial PRIMARY KEY,
       subscriber_id bigint NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
       device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       status text NOT NULL DEFAULT 'solicitado'
         CHECK (status IN ('solicitado','aprobado','pendiente_instalacion','piloto_activo','activo','suspendido','finalizado')),
       offer jsonb NOT NULL DEFAULT '{}'::jsonb,
       monthly_fee_cents integer CHECK (monthly_fee_cents IS NULL OR monthly_fee_cents >= 0),
       taxes jsonb NOT NULL DEFAULT '{}'::jsonb,
       conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
       started_at timestamptz,
       ended_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS services_vigente_device_idx ON services(device_id) WHERE status IN ('piloto_activo','activo')`,
  `CREATE INDEX IF NOT EXISTS services_subscriber_idx ON services(subscriber_id, created_at DESC)`,

  // Estado operativo, historial de configuración y auditoría.
  `DO $$ BEGIN
     CREATE TABLE device_config_versions (
       id bigserial PRIMARY KEY,
       device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       version integer NOT NULL CHECK (version > 0),
       config jsonb NOT NULL,
       requested_version integer,
       confirmed_version integer,
       changed_by bigint REFERENCES subscribers(id),
       change_reason text,
       applied_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       UNIQUE (device_id, version)
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS device_config_versions_device_idx ON device_config_versions(device_id, version DESC)`,
  // Momento en que el equipo pidió la configuración: separa "solicitado" de "recibido".
  `ALTER TABLE device_config_versions ADD COLUMN IF NOT EXISTS requested_at timestamptz`,
  `UPDATE device_config_versions SET requested_at = created_at WHERE requested_version IS NOT NULL AND requested_at IS NULL`,
  `DO $$ BEGIN
     CREATE TABLE device_status (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TABLE station_sensors (
       id text PRIMARY KEY,
       name text NOT NULL,
       unit text NOT NULL,
       min_value real,
       max_value real,
       description text,
       is_core boolean NOT NULL DEFAULT false
     );
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `INSERT INTO station_sensors (id, name, unit, min_value, max_value, description, is_core) VALUES
     ('temperature','Temperatura','°C',-80,100,'Temperatura ambiente',true),
     ('humidity','Humedad','%',0,100,'Humedad relativa',true),
     ('pressure','Presión','Pa',30000,120000,'Presión atmosférica',true),
     ('battery','Batería','mV',0,6000,'Voltaje de batería',true),
     ('lux','Iluminancia','lux',0,200000,'Radiación luminosa (canal opcional)',false)
     ON CONFLICT (id) DO NOTHING`,
  `DO $$ BEGIN
     CREATE TABLE audit_logs (
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
   EXCEPTION WHEN duplicate_table THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs(target_type, target_id, created_at DESC)`,
];

// Semilla de datos derivados: estado operativo y versión 1 de configuración.
const seeds = [
  // Cada estación existente recibe su instalación inicial (vigente) desde sus
  // datos actuales, para que el histórico tenga una instalación de referencia.
  `INSERT INTO installations (device_id, site_name, location_type, zone, latitude, longitude, altitude, started_at)
     SELECT d.id, d.name, d.location_type, d.public_zone, d.latitude, d.longitude, d.altitude,
       coalesce(d.installation_date::timestamptz, d.created_at)
     FROM devices d
     WHERE NOT EXISTS (SELECT 1 FROM installations i WHERE i.device_id = d.id)`,
  `INSERT INTO device_status (device_id, last_contact, firmware_version)
     SELECT d.id, d.last_seen_at, d.firmware_version FROM devices d
     ON CONFLICT (device_id) DO NOTHING`,
  `UPDATE device_status s SET last_valid_data = v.last_valid
     FROM (SELECT device_id, max(observed_at) AS last_valid FROM measurements
           WHERE is_validated = true GROUP BY device_id) v
     WHERE s.device_id = v.device_id AND s.last_valid_data IS NULL`,
  `INSERT INTO device_config_versions (device_id, version, config, confirmed_version, applied_at, change_reason)
     SELECT c.device_id, 1, c.config, 1, c.updated_at, 'Migración inicial'
     FROM device_configs c
     WHERE NOT EXISTS (SELECT 1 FROM device_config_versions v WHERE v.device_id = c.device_id)
       AND c.config <> '{}'::jsonb`,
  `UPDATE device_status s SET config_version = v.version
     FROM (SELECT device_id, max(version) AS version FROM device_config_versions GROUP BY device_id) v
     WHERE s.device_id = v.device_id AND s.config_version = 0`,
  // Primer suscriptor pasa a administrador para no perder acceso de gestión.
  `UPDATE subscribers SET role = 'admin' WHERE id = (SELECT min(id) FROM subscribers) AND role = 'viewer'
     AND NOT EXISTS (SELECT 1 FROM subscribers WHERE role = 'admin')`,
  // Sin tocar datos de salud ni inventarlos: la cuenta se marca verificada solo
  // si consta que consumió un enlace de acceso (prueba de control del correo).
  `UPDATE subscribers s SET email_verified_at = m.consumed_at
     FROM (SELECT DISTINCT ON (email) email, consumed_at FROM magic_links
           WHERE consumed_at IS NOT NULL ORDER BY email, consumed_at) m
     WHERE m.email = s.email_normalized AND s.email_verified_at IS NULL`,
  // Los consentimientos anteriores se conservan como hechos históricos, con su
  // versión original y bajo finalidad de SERVICIO: la aceptación antigua era para
  // atender la solicitud o recibir avisos, no para publicidad. Nadie pasa a estar
  // autorizado para publicidad por el simple hecho de migrar.
  `INSERT INTO consent_records (subscriber_id, purpose, channel, action, text_version, source, recorded_at)
     SELECT s.id, 'service', 'email', 'granted', 'legacy-v0', 'migration', coalesce(s.consent_at, s.created_at)
     FROM subscribers s
     WHERE s.communication_consent = true
       AND NOT EXISTS (SELECT 1 FROM consent_records c
         WHERE c.subscriber_id = s.id AND c.purpose = 'service' AND c.source = 'migration')`,
  `INSERT INTO consent_records (lead_id, purpose, channel, action, text_version, source, recorded_at)
     SELECT l.id, 'service', 'whatsapp', 'granted', 'legacy-lead-v0', 'lead', coalesce(l.consent_at, l.created_at)
     FROM farm_leads l
     WHERE l.consent = true
       AND NOT EXISTS (SELECT 1 FROM consent_records c WHERE c.lead_id = l.id)`,
];

// Ejecuta una sentencia intentando siempre dejar la lista utilizable:
// schema.sql se parte por ';', que no puede aparecer en comentarios ni literales.
async function runStatements(label, statements) {
  for (const statement of statements) {
    try {
      await sql.unsafe(statement);
    } catch (error) {
      const head = statement.replace(/\s+/g, ' ').slice(0, 160);
      throw new Error(`${label}: ${error.message}\n  sentencia: ${head}`);
    }
  }
}

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await runStatements('schema.sql', schema.split(';').map((part) => part.trim()).filter(Boolean));
  // El ESP32 almacena secuencias uint32 monótonas.
  await sql`ALTER TABLE measurements ALTER COLUMN sequence TYPE bigint`;
  await sql`ALTER TABLE measurements DROP CONSTRAINT IF EXISTS measurements_sequence_check`;
  await sql`ALTER TABLE measurements ADD CONSTRAINT measurements_sequence_check CHECK (sequence BETWEEN 0 AND 4294967295)`;
  await runStatements('upgrades', upgrades);
  await runStatements('seeds', seeds);
  console.log('Neon schema is up to date');
} finally {
  await sql.end();
}
