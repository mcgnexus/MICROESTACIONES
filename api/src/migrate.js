import { readFile } from 'node:fs/promises';
import { sql } from './db.js';

// Mejoras incrementales: cada sentencia es idempotente para bases existentes.
// En instalación limpia schema.sql ya trae las columnas y los ALTER se saltan.
const upgrades = [
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS owner text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'finca' CHECK (location_type IN ('urbano','finca','otro'))`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS public_zone text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS altitude integer CHECK (altitude IS NULL OR altitude BETWEEN -500 AND 9000)`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS installation_date date`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS sensors jsonb NOT NULL DEFAULT '{"temperature":true,"humidity":true,"pressure":true,"battery":true,"lux":false}'::jsonb`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version text`,
  `ALTER TABLE devices ADD COLUMN IF NOT EXISTS publish_permission boolean NOT NULL DEFAULT false`,

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
  `DO $$ BEGIN
     ALTER TABLE alerts ADD CONSTRAINT alerts_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES alert_rules(id);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer'))`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise'))`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS communication_consent boolean NOT NULL DEFAULT false`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS consent_at timestamptz`,
  `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS pilot_requests jsonb NOT NULL DEFAULT '[]'::jsonb`,

  `CREATE INDEX IF NOT EXISTS measurements_validated_idx ON measurements(device_id, observed_at DESC) WHERE is_validated = true`,
  `CREATE INDEX IF NOT EXISTS measurements_deleted_idx ON measurements(deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS subscribers_role_idx ON subscribers(role)`,
  `CREATE INDEX IF NOT EXISTS alerts_delivery_idx ON alerts(delivery_status) WHERE delivery_status <> 'delivered'`,

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
];

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
    await sql.unsafe(statement);
  }
  // El ESP32 almacena secuencias uint32 monótonas.
  await sql`ALTER TABLE measurements ALTER COLUMN sequence TYPE bigint`;
  await sql`ALTER TABLE measurements DROP CONSTRAINT IF EXISTS measurements_sequence_check`;
  await sql`ALTER TABLE measurements ADD CONSTRAINT measurements_sequence_check CHECK (sequence BETWEEN 0 AND 4294967295)`;
  for (const statement of upgrades) await sql.unsafe(statement);
  for (const statement of seeds) await sql.unsafe(statement);
  console.log('Neon schema is up to date');
} finally {
  await sql.end();
}
