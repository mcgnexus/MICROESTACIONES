# Modelo de datos y responsabilidades — TecRural Microestación

Fecha: 2026-10-09
Estrategia: migraciones incrementales sobre el esquema actual. Sin esquema paralelo.
Referencia de mediciones: `measurements` durante toda la transición. No se renombra ni se copia por motivos de presentación.

## 1. Principios

- Una **fuente de verdad** por concepto; los campos heredados se retiran gradualmente.
- Separar tres cosas que no se implican entre sí:
  1. **Propiedad del aparato**: la estación es de TecRural.
  2. **Acceso del cliente**: qué usuarios ven qué estaciones.
  3. **Condiciones de uso de los datos**: consentimiento, publicación y finalidad.
- Un usuario puede ser cuenta gratuita y cliente después **sin crear otra identidad**.
- Una estación puede trasladarse; su histórico queda vinculado a la **instalación vigente** en cada muestra.
- Una reasignación **no** muestra al nuevo cliente datos privados del anterior.
- Conservar observaciones originales y decisiones de calidad. Correcciones trazables: valor original, motivo, autor, fecha y revisión. No borrar anomalías en silencio.

## 2. Diccionario de datos

### 2.1 Usuario

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | bigserial PK | — | `subscribers` |
| `email` | text | Correo tal cual se recibió | `subscribers` |
| `email_normalized` | text GENERATED | `lower(btrim(email))`, único | `subscribers` |
| `email_verified_at` | timestamptz | Prueba de control del correo | `subscribers` |
| `active` | boolean | Estado de la cuenta | `subscribers` |
| `role` | text | `admin`/`operator`/`viewer` (administrativo) | `subscribers` |
| `plan` | text | `free`/`pro`/`enterprise` | `subscribers` |

Clave única: `subscribers_email_normalized_idx` sobre `email_normalized`. Evita duplicados por mayúsculas/espacios.

### 2.2 Sesión y acceso temporal

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `token_hash` | text PK | Solo hash; el valor claro viaja una vez | `web_sessions`, `magic_links` |
| `expires_at` | timestamptz | Caducidad | ambas |
| `consumed_at` | timestamptz | Consumo único (magic link) | `magic_links` |

### 2.3 Emplazamiento

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | bigserial PK | — | `sites` (nueva) |
| `name` | text | Nombre reconocible | `sites` |
| `location_type` | text | `urbano`/`finca`/`casa_campo` | `sites` |
| `zone` | text | Zona pública | `sites` |
| `latitude`/`longitude` | double precision | Coordenadas privadas | `sites` |

Nota de transición: hoy `devices` mezcla estación y emplazamiento. Se extrae a `sites`; `devices.site_id` apunta al emplazamiento vigente.

### 2.4 Estación

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | text PK | Identidad del equipo | `devices` |
| `owner` | text | TecRural (propietario del aparato) | `devices` |
| `sensors` | jsonb | Canales instalados | `devices` |
| `firmware_version` | text | Versión del firmware | `devices` |
| `active` | boolean | Estado operativo | `devices` |

### 2.5 Instalación

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | bigserial PK | — | `installations` (nueva) |
| `device_id` | text FK | Estación instalada | `installations` |
| `site_id` | bigint FK | Emplazamiento | `installations` |
| `started_at` | timestamptz | Inicio | `installations` |
| `ended_at` | timestamptz | Fin (traslado o retirada) | `installations` |
| `height_m` | numeric | Altura de montaje | `installations` |
| `shelter` | text | Protección | `installations` |
| `maintenance` | jsonb | Registro de mantenimiento | `installations` |

Regla: **como máximo una instalación abierta por estación** (índice único parcial donde `ended_at IS NULL`). El histórico de mediciones se ata a la instalación vigente.

### 2.6 Acceso a estación

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `subscriber_id` | bigint FK | Usuario autorizado | `station_access` (nueva) |
| `device_id` | text FK | Estación | `station_access` |
| `scope` | text | `view`/`alert` | `station_access` |
| `granted_at`/`revoked_at` | timestamptz | Vigencia | `station_access` |

Separado del rol administrativo. Sustituye gradualmente a `subscriber_devices` y `farm_devices`. Clave única `(subscriber_id, device_id, scope)`.

### 2.7 Servicio

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | bigserial PK | — | `services` (nueva) |
| `subscriber_id` | bigint FK | Cliente | `services` |
| `device_id` | text FK | Estación asignada | `services` |
| `status` | text | `piloto`/`activo`/`suspendido`/`baja` | `services` |
| `started_at`/`ended_at` | timestamptz | Fechas | `services` |
| `offer` | jsonb | Oferta acordada | `services` |
| `monthly_fee_cents` | integer | Cuota acordada | `services` |
| `taxes` | jsonb | Impuestos especificados | `services` |

Regla: cada piloto conserva el precio y condiciones realmente acordados; la cuota de 100 €/mes es hipótesis, no tarifa automática.

### 2.8 Medición

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | bigserial PK | — | `measurements` (sin cambios) |
| `device_id` | text FK | Estación | `measurements` |
| `installation_id` | bigint FK | Instalación vigente al medir | `measurements` (nueva columna) |
| `observed_at` | timestamptz | Instante de observación | `measurements` |
| `received_at` | timestamptz | Instante de recepción | `measurements` |
| `source` | text | `wifi`/`lora` | `measurements` |
| `time_quality` | smallint | Calidad de hora | `measurements` |
| `is_validated` | boolean | Dato validado | `measurements` |
| `validation_flags` | integer | Motivos | `measurements` |
| `raw_payload` | jsonb | Valor original | `measurements` |
| `deleted_at` | timestamptz | Borrado suave | `measurements` |

Única: `(device_id, sequence, observed_at)`. Correcciones trazables vía `validated_by`, `validated_at`, `invalidated_reason` y `audit_logs`.

### 2.9 Fuente externa

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `provider` | text | `aemet`/`open_meteo` | `aemet_observations`, `external_forecasts` |
| `station_id`/`municipality` | text | Estación o municipio | ambas |
| `payload` | jsonb | Respuesta original | ambas |
| `fetched_at` | timestamptz | Fecha de consulta | ambas |

### 2.10 Comparación

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `local_measurement_id` | bigint FK | Muestra local | `comparisons` (nueva) |
| `external_observation_id` | bigint FK | Muestra externa | `comparisons` |
| `gap_seconds` | integer | Separación temporal | `comparisons` |
| `method_version` | text | Versión del método | `comparisons` |
| `difference_c` | real | Resultado reproducible | `comparisons` |

Regla: reproducible; guarda las dos identidades y la versión del método.

### 2.11 Regla y episodio

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `rule_id` | bigint FK | Umbral y recuperación | `alert_rules` |
| `rule_snapshot` | jsonb | Regla vigente al avisar | `alerts` |
| `episode` | — | Aviso con ciclo de vida | `alerts` |
| `measurement_id` | bigint FK | Muestra que origina | `alerts` |
| `closed_at`/`auto_resolved` | timestamptz/boolean | Cierre | `alerts` |

### 2.12 Contacto y entrega

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `channel` | text | `whatsapp`/`email` | `subscriber_contacts`, `notification_outbox` |
| `address` | text | Destino | ambas |
| `verified_at`/`opted_in_at`/`opted_out_at` | timestamptz | Permisos aplicables | `subscriber_contacts` |
| `status`/`attempts`/`last_error` | text/int/text | Historial de intentos | `notification_outbox` |

### 2.13 Solicitud comercial

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `id` | bigserial PK | — | `farm_leads` |
| `name`/`phone` | text | Contacto | `farm_leads` |
| `interest` | text | Necesidad | `farm_leads` |
| `campaign` | jsonb | Origen validado | `farm_leads` |
| `status` | text | Etapa del seguimiento | `farm_leads` |

### 2.14 Consentimiento

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `purpose` | text | `service`/`commercial` | `consent_records` |
| `channel` | text | `email`/`whatsapp` | `consent_records` |
| `action` | text | `granted`/`revoked` | `consent_records` |
| `text_version` | text | Versión del texto | `consent_records` |
| `recorded_at` | timestamptz | Fecha | `consent_records` |

### 2.15 Auditoría y ejecución de tareas

| Campo | Tipo | Regla | Fuente de verdad |
| --- | --- | --- | --- |
| `actor_id` | bigint FK | Actor | `audit_logs` |
| `action` | text | Acción | `audit_logs` |
| `created_at` | timestamptz | Fecha | `audit_logs` |
| `result`/`error` | text | Resultado y errores sanitizados | `audit_logs` / logs |

## 3. Relaciones

```
subscribers 1─N station_access N─1 devices
subscribers 1─N services        N─1 devices
subscribers 1─N farms           N─N devices        (vía farm_devices → station_access)
subscribers 1─N subscriber_contacts 1─N contact_verifications
subscribers 1─N consent_records
subscribers 1─N web_sessions / magic_links
devices     1─N installations   N─1 sites
devices     1─N measurements
installations 1─N measurements
devices     1─N alert_rules     1─N alerts 1─N notification_outbox
devices     1─N aemet_observations / external_forecasts
measurements 1─N comparisons    N─1 aemet_observations
farm_leads  1─N consent_records / notification_outbox
```

## 4. Claves únicas

| Tabla | Clave única | Motivo |
| --- | --- | --- |
| `subscribers` | `email_normalized` | Evita duplicados por formato |
| `measurements` | `(device_id, sequence, observed_at)` | Idempotencia del lote |
| `installations` | parcial `(device_id) WHERE ended_at IS NULL` | Una instalación abierta |
| `station_access` | `(subscriber_id, device_id, scope)` | Sin permisos duplicados |
| `services` | parcial `(device_id) WHERE status IN ('piloto','activo')` | Un servicio vigente |
| `alert_rules` | `(device_id, metric, comparator, threshold)` | Sin reglas duplicadas |
| `subscriber_contacts` | `(subscriber_id, channel)` | Un destino por canal |
| `web_sessions` | `token_hash` | Sesión única |
| `magic_links` | `token_hash` | Enlace único |
| `device_config_versions` | `(device_id, version)` | Historial ordenado |

## 5. Retención

| Dato | Retención | Nota |
| --- | --- | --- |
| `measurements` | Indefinida (dato original) | Los límites 24 h/7 d/90 d son de consulta, no de borrado |
| `raw_payload` | Igual que la medición | Conserva el valor recibido |
| `aemet_observations` / `external_forecasts` | Según `retention.js` | Dato externo |
| `web_sessions` / `magic_links` | Caducidad + purga | Tokens consumidos/caducados |
| `notification_outbox` | Tras entrega/caducidad | Historial de intentos |
| `audit_logs` | Larga | Trazabilidad |
| `metric_daily` | Agregada | Sin datos personales |

## 6. Estrategia de migración

1. **Aditiva e idempotente**: `schema.sql` con `CREATE TABLE IF NOT EXISTS`; `migrate.js` con `ALTER ... IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS`.
2. **Nuevas tablas** (`sites`, `installations`, `station_access`, `services`, `comparisons`) creadas sin tocar las existentes.
3. **Columnas nuevas** en tablas vivas (`measurements.installation_id`) con relleno retroactivo y `NULL` permitido hasta completar.
4. **Compatibilidad hacia atrás**: el código antiguo ignora las tablas/columnas nuevas; la reversión es volver a desplegar.
5. **Relleno gradual**: crear una instalación inicial por estación y asociar mediciones históricas; no se copia `measurements`.
6. **Retirada de campos heredados** solo cuando ninguna lectura los use: `subscribers.communication_consent`/`consent_at` (sustituidos por `consent_records`), `subscriber_devices`/`farm_devices` (sustituidos por `station_access`).
7. **Paso previo obligatorio**: copia de seguridad y prueba de restauración en entorno aislado.

## 7. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Usuario duplicado por mayúsculas | `email_normalized` único lo impide |
| Traslado de estación | Nueva fila en `installations`; el histórico queda ligado a la instalación de cada muestra |
| Cancelación de servicio | `services.ended_at`; el acceso puede revocarse sin borrar datos |
| Reasignación a otro cliente | `station_access` revocado al anterior; el nuevo no ve datos privados previos |
