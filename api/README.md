# TECRURAL API y panel privado

Servicio Node.js para comunicar las estaciones con Neon PostgreSQL y servir el panel de suscriptores. Las claves de Neon solo se configuran en el entorno del servidor; el ESP32 utiliza un token individual de API.

## Puesta en marcha

Requisitos: Node.js 20+, una base Neon y una URL HTTPS para el despliegue.

```sh
cd api
npm install
```

Copia `.env.example` a `.env` en desarrollo, asigna `DATABASE_URL` de Neon y configura `COOKIE_SECURE=false` únicamente para pruebas locales por HTTP. En producción conserva `COOKIE_SECURE=true` y sirve la aplicación detrás de HTTPS.

```sh
npm run migrate
npm run create-user -- agricultor@example.com "una-contraseña-larga-y-unica"
npm run provision-device -- estacion-01 "Estación TECRURAL" 40.4168 -3.7038
npm start
```

El aprovisionamiento del dispositivo imprime un token bearer una sola vez. Guárdalo en un canal seguro. Para asociar una estación a un suscriptor, ejecuta en Neon:

```sql
INSERT INTO subscriber_devices (subscriber_id, device_id)
SELECT id, 'estacion-01' FROM subscribers WHERE email = 'agricultor@example.com'
ON CONFLICT DO NOTHING;
```

Para el firmware, copia `firmware/tecrural_station/src/secrets.h.example` como `secrets.h`, completa Wi-Fi, un `DEVICE_ID` elegido, URL HTTPS y token individual. Usa exactamente el mismo `DEVICE_ID` en `npm run provision-device` y en `secrets.h`. TLS valida con el paquete de CA integrado en Arduino-ESP32; no desactives esa verificación. No incluyas `secrets.h` en el repositorio.

## API

- `POST /api/measurements` — lote de hasta 32 lecturas, con `Authorization: Bearer <token>`. Valida los datos, persiste usando `(device_id, sequence, observed_at)` como clave idempotente y responde `{ "ack_through": n }`. La secuencia acepta el `uint32` persistente del firmware.
- `GET /api/config` — configuración vigente del dispositivo, autenticada con el mismo token.
- `POST /api/v1/forecasts` — ingesta autenticada de hasta 240 puntos de previsión, con `FORECAST_INGEST_TOKEN` del lado servidor.
- `POST /api/auth/login`, `POST /api/auth/logout` — sesión privada del panel; cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción.
- `GET /api/v1/dashboard?period=24h|7d|30d` — última lectura, estado, series históricas, resúmenes, previsiones externas disponibles y estaciones cercanas para las estaciones vinculadas al suscriptor.
- `GET /api/v1/alerts` — avisos asociados a las estaciones de la suscripción.
- `GET /health` — comprobación de servicio y conexión a Neon.

Los avisos de la estación se crean de forma idempotente al ingresar una lectura con nivel de alerta. Previsiones y estimaciones se almacenan/devuelven en campos distintos a las mediciones propias; este servicio no genera predicciones. La ruta de ingesta de previsiones queda lista para un adaptador del proveedor elegido; aún no se ha seleccionado ni conectado un proveedor.

La lista de estaciones cercanas incluye únicamente estaciones activas, vistas en las últimas dos horas y dentro del radio de cobertura configurado. El panel indica explícitamente si no hay tres estaciones representativas.

## Seguridad y operación

- Nunca pongas `DATABASE_URL` en el firmware ni en el código cliente.
- Usa un token aleatorio distinto por estación y revócalo poniendo `revoked_at` en `device_credentials` si se pierde.
- No expongas el servidor directamente en HTTP. Configura `TRUST_PROXY=true` solo detrás de un proxy inverso de confianza.
- Crea usuarios mediante el comando de aprovisionamiento; no hay registro público.
- Antes de producción, configura proveedor externo, política de retención y revisa los límites de tarifa/uso de Neon.
