# Adaptadores AEMET — contratos y muestras sanitizadas

Fecha: 2026-10-09
Principio: tres adaptadores **independientes**. Un fallo de previsión no marca como fallida la medición local. No se introduce una segunda fuente meteorológica en esta fase sin necesidad concreta.

## 1. Adaptador de observación de estación

| Campo | Valor |
| --- | --- |
| Endpoint | `/observacion/convencional/datos/estacion/{idema}` |
| Identificador geográfico | `idema` (p. ej. `5051X`) |
| Cadencia propuesta | Cada 30 minutos |
| Estado | `current`/`empty`/`stale`/`unavailable` |
| Metadatos | Última consulta, último éxito, antigüedad, procedencia, respuesta original sanitizada |

### Campos y su definición

| Campo AEMET | Significado | Conversión |
| --- | --- | --- |
| `fint` | **Final de observación en UTC** | Instante observado |
| `ta` | Temperatura instantánea | °C directo |
| `hr` | Humedad relativa | % directo |
| `pres` | Presión | hPa directo |
| `prec` | Precipitación | mm |
| `vv` / `vmax` | Viento medio / racha (m/s) | × 3,6 → km/h |
| `dv` | Dirección del viento | — |
| `idema` | Indicativo | Identidad |
| `lat`/`lon`/`alt` | Coordenadas y altitud | — |

### Huéscar — estación 5051X (verificada)

| Dato | Valor | Nota |
| --- | --- | --- |
| Indicativo | `5051X` | Ficha oficial AEMET |
| Distancia a la referencia urbana | ~11,4 km | No demuestra diferencia fija de temperatura |
| Altitud | ~1101 m | La distancia exacta exige coordenadas reales verificadas |

### Regla de fecha (crítica)

- Interpretar cada fecha según la **definición del proveedor**: `fint` = fin de observación en UTC.
- Una cadena **sin sufijo** no debe convertirse automáticamente desde Madrid.
- Conservar: valor original, regla aplicada y **versión del adaptador**.
- El posible error horario detectado en el código auditado **no prueba** que afecte a todos los registros: revisar el histórico normalizado antes de corregirlo.

### Muestra sanitizada (observación)

```json
[
  {
    "idema": "5051X",
    "fint": "2026-10-09T14:00:00UTC",
    "ta": 18.2,
    "hr": 61,
    "pres": 1013.2,
    "prec": 0.0,
    "vv": 3.1,
    "vmax": 6.4,
    "dv": "SO",
    "lat": 37.8614,
    "lon": -2.6528,
    "alt": 1101
  }
]
```

Salida normalizada:

```json
{
  "provider": "AEMET",
  "stationId": "5051X",
  "observedAt": "2026-10-09T14:00:00.000Z",
  "temperatureC": 18.2,
  "humidityPct": 61,
  "pressureHpa": 1013.2,
  "precipitationMm": 0,
  "windKmh": 11.2,
  "windGustKmh": 23.0,
  "adapterVersion": "aemet-observation-v1",
  "dateRule": "fint_utc"
}
```

## 2. Adaptador de previsión municipal

| Campo | Valor |
| --- | --- |
| Endpoint | `/prediccion/especifica/municipio/diaria/{code}` |
| Identificador geográfico | Código de municipio |
| Cadencia propuesta | Cada 3 horas |
| Estado | `current`/`empty`/`stale`/`unavailable` |

- Es **previsión**, nunca medición local.
- Los riesgos orientativos (`forecastAdvisories`) declaran proveedor y `source: estimate`.
- Un fallo de previsión **no** invalida la medición local.

### Muestra sanitizada (previsión)

```json
[
  {
    "nombre": "Huéscar",
    "prediccion": {
      "dia": [
        {
          "fecha": "2026-10-09T00:00:00",
          "temperatura": { "maxima": 21, "minima": 7 },
          "probPrecipitacion": [{ "value": "20" }],
          "viento": [{ "velocidad": 15, "direccion": "SO" }],
          "estadoCielo": [{ "descripcion": "Poco nuboso", "periodo": "12-24" }]
        }
      ]
    }
  }
]
```

## 3. Adaptador de avisos oficiales

| Campo | Valor |
| --- | --- |
| Endpoint | `/avisos_cap/ultimoelaborado/area/{area}` |
| Área de descarga | `esp` o código de CCAA (`61` Andalucía…) |
| Código de zona | `611802` (contenido en los mensajes) |
| Cadencia propuesta | Cada 15 minutos |
| Formato | Locator JSON → URL `datos` → tar (`application/x-gtar`, opcional gzip) → XML CAP v1.2 |
| Estado | `current`/`empty`/`stale`/`unavailable` |

### Separación de conceptos

- **Área de descarga** ≠ **código de zona contenido en los mensajes**.
- El área de descarga deriva del prefijo de la zona (`downloadAreaForZone`); el código de zona sirve para **filtrar** el contenido.
- Resolver formato, vigencia, idioma, actualizaciones y cancelaciones.

### Reglas de interpretación

| Situación | Interpretación |
| --- | --- |
| `status=Minor` o «nivel verde»/«sin aviso» | **No** es un aviso: ausencia declarada |
| `msgType=cancel` | Retira el mensaje referenciado |
| `msgType=update` | Sustituye el anterior por referencia |
| `status` test/exercise/system | Se descarta |
| Sin aviso | No es un episodio de riesgo |
| Fallo de consulta | **No** confirma ausencia de avisos (`unavailable`) |
| `onset` futuro | «Próximo»; nunca cuenta como vigente |

### Muestra sanitizada (aviso CAP)

```xml
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>AEMET-2026-10-09-001</identifier>
  <sender>aemet@aemet.es</sender>
  <sent>2026-10-09T13:45:00+02:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <info>
    <language>es-ES</language>
    <event>Aviso por viento</event>
    <severity>Moderate</severity>
    <effective>2026-10-09T15:00:00+02:00</effective>
    <onset>2026-10-09T15:00:00+02:00</onset>
    <expires>2026-10-09T21:00:00+02:00</expires>
    <area>
      <areaDesc>Cuenca del Genil</areaDesc>
      <geocode><valueName>GN</valueName><value>611802</value></geocode>
    </area>
  </info>
</alert>
```

## 4. Cadencias, cuotas y caché

| Adaptador | Cadencia inicial | Caché |
| --- | --- | --- |
| Observación | 30 min | Última respuesta útil + estado |
| Previsión | 3 h | Última respuesta útil + estado |
| Avisos | 15 min | Última respuesta útil + estado |

- Ajustar a cuotas, frecuencia real de publicación y coste.
- Compartir consultas entre usuarios y estaciones que usen la misma fuente.
- Reintentar fallos con espera progresiva.
- Conservar la última respuesta útil con su estado.
- AEMET se sincroniza centralmente; una visita no lanza consulta externa nueva (`WEATHER_TTL_MS = 30 min`).

## 5. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Respuesta válida | `current` con valor |
| Respuesta vacía | `empty` (consulta válida sin datos) |
| Error 404 | `empty`, no fallo de canal |
| Límite de peticiones (429) | `stale`/`unavailable`, reintento con espera |
| Timeout | `stale` con última respuesta útil |
| JSON o recurso malformado | `unavailable`; no se interpreta como ausencia |
| Cancelación | Retira el aviso referenciado |
| Aviso futuro | «Próximo», no vigente |
| Aviso ajeno | Se filtra por zona/geometría |
| Fecha sin sufijo | Se conserva original; no se asume Madrid |
| Fallo de previsión | La medición local sigue disponible |
