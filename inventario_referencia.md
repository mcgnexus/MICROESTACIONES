# Inventario de referencia — TecRural Microestación

Fecha: 2026-10-09
Commit auditado: `6630a37ce943379576130aa80b05b484dde0a842`
Rama: `main`
Working tree: cambios sin commit (fases 10-13 en desarrollo)

## 1. Estado del repositorio

| Aspecto | Valor |
| --- | --- |
| Commit HEAD | `6630a37` — Excluye los CAP verdes de los avisos, prefiere espanol y separa proximos |
| Rama | `main` (única rama local y remota) |
| Working tree | Modificado: 10 archivos JS modificados, 10 eliminados, 12 nuevos en `api/public/dist/assets/` |
| Tests | 228/228 unitarios, 59/59 aceptación, 42/42 fase 13 |
| Build | esbuild → `api/public/dist/` |

## 2. Infraestructura y alojamiento

| Componente | Valor |
| --- | --- |
| Plataforma | Vercel (serverless) |
| Función | `api/index.js` → `api/src/server.js` |
| Runtime | Node.js ≥ 20 |
| Base de datos | Neon (PostgreSQL) |
| Plan Vercel | Gratuito (cron diario insuficiente para avisos) |
| Planificador | Externo: n8n llamando a `POST /api/v1/maintenance/scheduler` con `CRON_SECRET` |
| Dominio | `tecrural-microestacion.vercel.app` |

### Variables de entorno críticas

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión Neon |
| `PUBLIC_SITE_URL` | Dominio público |
| `SUPPORT_PHONE` / `SUPPORT_WHATSAPP` | Contacto |
| `WHATSAPP_PROVIDER` | `meta`, `twilio` o `disabled` |
| `EMAIL_PROVIDER` | `resend` o `console` |
| `CRON_SECRET` | Autenticación del planificador externo |
| `ALERT_ENGINE_VERIFIED` | Activa avisos de umbral local |
| `COOKIE_SECURE` | `true` en producción |
| `AEMET_API_KEY` | Consulta AEMET |
| `OTP_DEBUG` | Solo fuera de producción |

## 3. Esquema de producción (PostgreSQL/Neon)

### Tablas principales

| Tabla | Función |
| --- | --- |
| `devices` | Estaciones (públicas y privadas) |
| `device_credentials` | Tokens de dispositivo (hash) |
| `measurements` | Mediciones con trazabilidad completa |
| `subscribers` | Cuentas de usuario |
| `magic_links` | Enlaces de acceso de un solo uso |
| `web_sessions` | Sesiones web |
| `farms` / `farm_devices` | Agrupación de estaciones por finca |
| `farm_leads` | Captación de interesados |
| `alert_rules` | Reglas de avisos |
| `alerts` | Avisos generados |
| `notification_outbox` | Cola de entrega |
| `consent_records` | Consentimientos |
| `audit_logs` | Trazabilidad de cambios |
| `device_status` | Estado operativo |
| `device_configs` / `device_config_versions` | Configuración versionada |
| `aemet_observations` | Serie histórica AEMET |
| `external_forecasts` | Previsiones externas |

### Migraciones

- `schema.sql`: instalación limpia (CREATE TABLE IF NOT EXISTS)
- `migrate.js`: mejoras incrementales (ALTER ... IF NOT EXISTS)
- Aditivas e idempotentes, sin migraciones destructivas

## 4. Contratos del firmware

### Estructura del payload de medición

```json
{
  "device_id": "esp32c3-01",
  "sequence": 12345,
  "timestamp": 1696852800,
  "quality": 0,
  "temp_c": 22.5,
  "hum_pct": 65.0,
  "press_pa": 101325,
  "batt_mv": 3900,
  "lux": null,
  "source": "wifi",
  "config_version": 3,
  "flags": 7,
  "alert": 0
}
```

### Endpoints que el firmware usa

| Endpoint | Método | Uso |
| --- | --- | --- |
| `/api/measurements` | POST | Subir lote (máx. 32 registros) |
| `/api/config` | GET | Obtener configuración |
| `/api/config/confirm` | POST | Confirmar versión aplicada |

### Flags de medición

| Bit | Significado |
| --- | --- |
| 0 | Temperatura válida |
| 1 | Humedad válida |
| 2 | Presión válida |
| 3 | Batería válida |
| 4 | Hora válida |
| 5-7 | Fuera de rango (temp/hum/pres) |

## 5. Integraciones activas

| Integración | Estado | Uso |
| --- | --- | --- |
| AEMET | Activa | Observaciones, previsiones, avisos CAP |
| Open-Meteo | Activa | Previsión horaria/diaria |
| WhatsApp (Meta/Twilio) | Configurable | Avisos y verificación |
| Email (Resend) | Configurable | Magic links, avisos |
| n8n | Activa | Planificador externo (cron) |
| MCP | Activa | Servidor solo lectura para agentes IA |

## 6. Módulos conservados vs. sustituidos

### Conservados (funcionan correctamente)

- Ingesta de mediciones con validación
- Trazabilidad completa (raw_payload, flags, validación)
- Histórico de datos
- Sistema de avisos con motor de reglas
- Cola de entrega con reintentos
- Autenticación por magic link
- Panel de administración
- API pública de estaciones
- PWA con service worker

### Sustituidos/ocultos en v1

| Función | Estado en v1 |
| --- | --- |
| Diagnóstico IA | Aplazado |
| Automatización riego | Aplazado |
| Cuaderno agrícola | Aplazado |
| Mapa microclimas | Aplazado |
| Tienda hardware | Aplazado |
| Múltiples planes | Aplazado |
| Apps nativas | Aplazado (solo PWA) |
| Cobro automático | Aplazado |
| Lluvia/viento/suelo | No disponible (sensores) |

## 7. Entornos

| Entorno | Estado | Uso |
| --- | --- | --- |
| Producción | Vercel + Neon | Web pública |
| Desarrollo | Local + Neon | Desarrollo |
| Pruebas | Local + BD aislada | Validación |

### Separación de entornos

- **Desarrollo**: `node --watch src/server.js` con `EMAIL_PROVIDER=console`
- **Pruebas**: BD sintética o copia anonimizada, sin envíos reales
- **Producción**: Vercel + Neon, con todos los proveedores configurados

## 8. Copia de seguridad y restauración

### Backup

```sh
pg_dump "$DATABASE_URL" --format=custom --file=backup-tecrural-$(date +%Y%m%d%H%M).dump
```

### Restauración

```sh
pg_restore --dbname "$DATABASE_URL_RESTORE" --clean --if-exists backup-tecrural-YYYYMMDDHHMM.dump
```

### Verificación

- Confirmar tamaño de la copia
- Verificar tablas principales: `subscribers`, `devices`, `measurements`, `farm_leads`
- Probar restauración en entorno aislado antes de migración

## 9. Credenciales

Las credenciales compartidas previamente en conversaciones NO deben incorporarse al repositorio ni a documentos. Su sustitución forma parte de la preparación operativa.

## 10. Validación de la versión de prueba

La versión de prueba debe:
1. Recibir un lote de ejemplo con token de estación de prueba
2. Representar los mismos datos que la referencia
3. No escribir ni enviar nada a producción
4. Confirmar `ack_through` sin disparar avisos con valores inválidos
