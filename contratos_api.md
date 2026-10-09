# Catálogo de contratos de la API — TecRural Microestación

Fecha: 2026-10-09
Estado: catálogo documental (sin implementación nueva). No modifica el contrato del dispositivo.

## 1. Grupos de operaciones

| Grupo | Prefijo | Autenticación | Caché |
| --- | --- | --- | --- |
| Consulta pública | `/api/v1/public/*`, `/robots.txt`, `/sitemap.xml` | Ninguna | Breve, compartida |
| Cuenta e histórico gratuito | `/api/v1/measurements`, `/api/v1/dashboard`, `/api/v1/stations` | Sesión `viewer` | Sin caché compartida |
| Datos privados | `/api/v1/stations/:id/*`, `/api/v1/alerts`, `/api/v1/farms` | Sesión + ámbito | Sin caché |
| Administración | `/api/v1/admin/*` | Sesión `admin` | Sin caché |
| Recepción del firmware | `/api/measurements`, `/api/config`, `/api/config/confirm` | Token de dispositivo | Sin caché |
| Tareas periódicas | `/api/v1/maintenance/*` | `CRON_SECRET` | Sin caché |
| Webhooks de proveedor | `/api/v1/whatsapp/webhook`, `/api/v1/email/webhook` | Firma del proveedor | Sin caché |

## 2. Reglas transversales

- **Unidades canónicas**: temperatura °C, humedad relativa %, presión hPa, tensión V, lux lx.
- El firmware transmite presión en Pa y tensión en mV; el adaptador convierte explícitamente a hPa y V.
- Cada dato meteorológico incluye: valor, unidad, fuente, instante observado, instante recibido (cuando procede), estado de antigüedad y calidad aplicable.
- Identificadores estables y tipos explícitos para fechas, valores ausentes y estados.
- Almacenamiento en UTC; presentación en `Europe/Madrid`.
- Periodos con límites inequívocos y criterio del extremo final (`from` inclusivo, `to` exclusivo).
- La autorización y el límite de histórico gratuito se aplican en el servidor; no basta ocultar controles.
- Las rutas públicas devuelven exclusivamente campos públicos permitidos.

## 3. Errores comprensibles

| Código | Cuerpo | Cuándo |
| --- | --- | --- |
| 400 | `{ "error": "invalid_body", "details": [...] }` | Validación de entrada |
| 400 | `{ "error": "invalid_range" }` | Fecha no parseable |
| 401 | `{ "error": "authentication_required" }` | Sin sesión |
| 401 | `{ "error": "invalid_device_token" }` | Token de dispositivo inválido |
| 403 | `{ "error": "forbidden" }` | Rol insuficiente |
| 403 | `{ "error": "device_identity_mismatch" }` | `device_id` no coincide con el token |
| 404 | `{ "error": "station_not_found" }` | Fuera de ámbito (no revela existencia) |
| 429 | `{ "error": "too_many_requests" }` | Límite de peticiones |
| 503 | `{ "error": "email_delivery_unavailable" }` | Canal de entrega caído |

Sin secretos ni trazas internas en el cuerpo.

## 4. Ejemplos de respuesta

### 4.1 Consulta pública — estación

`GET /api/v1/public/stations`

```json
{
  "stations": [
    {
      "name": "Estación urbana centro",
      "locationType": "urbano",
      "zone": "Casco urbano",
      "altitudeM": 640,
      "connectivity": "online",
      "temperatureC": 18.2,
      "temperatureUnit": "°C",
      "temperatureObservedAt": "2026-10-09T14:05:00.000Z",
      "temperatureFreshness": "fresh",
      "humidityPct": 61,
      "humidityUnit": "%",
      "humidityObservedAt": "2026-10-09T14:05:00.000Z",
      "humidityFreshness": "fresh",
      "source": "station_measurement",
      "comparison": {
        "state": "matched",
        "local": { "temperatureC": 18.2, "observedAt": "2026-10-09T14:05:00.000Z" },
        "aemet": { "stationId": "1234X", "temperatureC": 17.8, "observedAt": "2026-10-09T14:00:00.000Z" },
        "windowMinutes": 10,
        "differenceC": 0.4,
        "methodVersion": "pair-v1"
      }
    }
  ]
}
```

### 4.2 Sin pareja AEMET

```json
{
  "comparison": {
    "state": "no_pair",
    "reason": "no_observation_within_window",
    "windowMinutes": 10,
    "local": { "temperatureC": 18.2, "observedAt": "2026-10-09T14:05:00.000Z" },
    "aemet": null,
    "differenceC": null
  }
}
```

### 4.3 Histórico gratuito (7 días)

`GET /api/v1/measurements?from=2026-10-02T00:00:00Z&to=2026-10-09T00:00:00Z&limit=100`

```json
{
  "measurements": [
    {
      "id": "10231",
      "deviceId": "esp32c3-01",
      "observedAt": "2026-10-09T14:05:00.000Z",
      "receivedAt": "2026-10-09T14:17:00.000Z",
      "temperatureC": 18.2,
      "humidityPct": 61,
      "pressureHpa": 1013.2,
      "batteryV": 3.92,
      "source": "wifi",
      "isValidated": true,
      "validationFlags": 0,
      "ageState": "current"
    }
  ],
  "total": 2016,
  "valid": 2010,
  "invalid": 6,
  "limit": 100,
  "offset": 0
}
```

### 4.4 Comparación — campos exigidos

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `state` | enum | `matched`/`no_pair`/`stale`/`unavailable` |
| `local.observedAt` | ISO 8601 UTC | Identidad de la muestra local |
| `aemet.stationId` | string | Identidad de la muestra externa |
| `gapSeconds` | integer | Separación temporal |
| `differenceC` | number \| null | Resultado |
| `methodVersion` | string | Versión del método |
| `reason` | string \| null | Motivo de ausencia de pareja |

### 4.5 Recepción del firmware (sin cambios)

`POST /api/measurements`

```json
[
  {
    "device_id": "esp32c3-01",
    "sequence": 12345,
    "ts": 1760018700,
    "quality": 2,
    "temp_c": 18.2,
    "hum_pct": 61.0,
    "press_pa": 101320,
    "batt_mv": 3920,
    "flags": 7,
    "alert": 0
  }
]
```

Respuesta:

```json
{ "ack_through": 12345, "applied_config_version": 3 }
```

## 5. Límites y paginación

| Recurso | Límite |
| --- | --- |
| Lote de mediciones | 1–32 registros |
| `limit` histórico | 1–500 (por defecto 100) |
| Exportación CSV | 20 000 filas |
| Rango máximo gratuito | 7 días (aplicado en servidor) |
| Peticiones de lead | 5 por ventana |
| Enlaces mágicos | 5 intentos por ventana |

## 6. Caché

| Respuesta | Política |
| --- | --- |
| Meteorológica pública | Breve, con antigüedad visible |
| Privada, sesión, administración | Sin caché compartida |
| AEMET | Sincronización central; una visita no lanza consulta externa nueva |

## 7. Validación

| Caso | Resultado |
| --- | --- |
| Datos nulos | Campos ausentes como `null`, nunca cero |
| Unidades | °C, %, hPa, V, lx |
| Fecha ambigua | Se exige ISO 8601 con zona; se almacena UTC |
| Petición excesiva | `429` o recorte al límite |
| Intervalo no autorizado | `400 invalid_range` |
| Estación ajena | `404 station_not_found` sin filtrar existencia |
| Cuerpo de error | Sin secretos ni trazas internas |
