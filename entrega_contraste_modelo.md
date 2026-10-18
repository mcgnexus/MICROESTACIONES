# Entrega — Contraste sensor vs modelo Open-Meteo

Fecha: 2026-10-18
Autor: sesión Hermes (VPS) con aprobación de Manuel.

## Qué funciona

- **Comparación «sensor vs modelo»** en la portada pública (`#comparacion-aemet`):
  - Empareja la lectura local más reciente con la **hora del modelo que la cubre** (ventana ±20 min). Si no hay pareja, se declara y no se calcula nada.
  - Open-Meteo con `timezone=auto` devuelve horas locales **sin offset**: se parsean con el reloj de Madrid (`parseMadridLocal`, punto fijo, mismo enfoque que `parseAemetInstantDetailed`). Sin esto, un servidor UTC desplazaría el emparejamiento 1–2 h y nunca habría pareja.
  - Diferencia con signo (`temperatura_microestacion_menos_OpenMeteo`) y, si hay datos, diferencia de presión frente a `surface_pressure` (la única presión comparable; `pressure_msl` no lo es).
  - La presión interna viaja en el cálculo pero **no** se publica en `history` (contrato público estable).
- **API**: `/api/v1/public/stations` expone `modelComparison` y `openMeteo` (current + fetchedAt + stale). Sin consultas nuevas a BD: reutiliza la historia de 24 h y el snapshot cacheado (TTL 30 min en `external_weather_snapshots`).
- **Atribución**: tarjeta con desplegable «Fuente del modelo» → Open-Meteo.com, licencia CC-BY 4.0.
- La sección se retituló «TRES FUENTES · MISMO PUNTO» (sensor, AEMET, modelo).

## Límites

- La celda del modelo es de ~11 km y ~1.018 m de altitud media (la estación está a 950 m): una diferencia de ~+1 °C es esperable y **no** es error de ninguno de los dos.
- El refresco del snapshot lo dispara la primera consulta que lo encuentre viejo (panel autenticado o ruta pública con refresco en primer plano). La ruta pública con caché serve el snapshot existente y difiere el refresco.
- La presión de superficie del modelo y la de la estación difieren por altitud de celda vs emplazamiento: la diferencia **no** es un error de calibración por sí sola.
- La coherencia del sensor no debe inferirse de una pareja aislada; la tarjeta muestra la pareja más reciente.

## Evidencias de aceptación

- Suite completa: **664/664 tests** (`node --test`), incluidos 8 nuevos (`src/model-comparison.test.js`) que cubren zona horaria, pareja con signo, `no_pair`/`no_model`, histórico reciente y tarjeta.
- Producción (deploy por push a `main`, verificado con curl): `GET /api/v1/public/stations` → HTTP 200, `modelComparison.state=matched`, diff +0,3 °C con offset 7 min, presión −1,0 hPa frente a `surface_pressure`, 2 parejas recientes. HTML servido con la sección nueva y el bundle firmado con la tarjeta.
- Incidente 1 durante el despliegue: la columna real de presión en `measurements` es `pressure_pa` (Pa, unidad del firmware); el primer push usaba `pressure_hpa` y produjo 500 en `/api/v1/public/stations` (PostgresError 42703). Corregido convirtiendo en SQL (`pressure_pa / 100.0`); verificado 200 OK después.
- Incidente 2 (bug preexistente destapado): el corte de frescura de `normalizeOpenMeteo` comparaba horas locales con `Date.parse` (zona del servidor): por la mañana descartaba las horas más recientes y el emparejamiento se quedaba sin pareja a media mañana. Corregido con `parseMadridLocal` + serie `hourlyRecent` (hasta 6 horas desde `now-2h`) que usa el emparejamiento sin tocar las tarjetas de futuro del panel.
- Nota serverless: el refresco del snapshot en la ruta pública va diferido (`backgroundRefresh: true`) y puede no completarse; hasta que expira el TTL (30 min) la tarjeta explica que el modelo está retrasado (`modelStaleSnapshot`). El panel autenticado sí refresca al entrar.

## Coste operativo añadido

- Cero llamadas nuevas a Open-Meteo: mismo snapshot y TTL que ya existían.
- Sin tablas nuevas ni migraciones: solo lectura de una columna existente (`pressure_pa`).
- HTML ~1 KB mayor (tarjeta SSR no incluida; la tarjeta se pinta en cliente como la de AEMET).
