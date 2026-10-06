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

- `POST /api/measurements` — lote de hasta 32 lecturas, con `Authorization: Bearer <token>`. Valida los datos, persiste usando `(device_id, sequence, observed_at)` como clave idempotente y responde `{ "ack_through": n }`. La secuencia acepta el `uint32` persistente del firmware. Un registro sin ningún canal (sensor caído en ese ciclo) se confirma igualmente sin crear fila, para que no bloquee el lote.
- `GET /api/config` — configuración vigente del dispositivo, autenticada con el mismo token.
- `POST /api/v1/forecasts` — ingesta autenticada de hasta 240 puntos de previsión, con `FORECAST_INGEST_TOKEN` del lado servidor.
- `POST /api/auth/login`, `POST /api/auth/logout` — sesión privada del panel; cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción.
- `POST /api/v1/leads` — captación pública de fincas (CTA "Solicitar piloto"), sin sesión y sin crear cuenta. Campos: nombre, teléfono WhatsApp, email, actividad (`agricultura`, `ganaderia`, `mixta`, `otra`), zona, cultivo o ganado, interés (`heladas`, `calor`, `tormentas`, `viento`, `humedad`, `general`), notas y consentimiento. Limita por IP y teléfono y descarta bots con un campo trampa. Al guardar, encola un email de confirmación al visitante (si dejó email) y un aviso interno a los administradores activos y a `ADMIN_NOTICE_EMAIL` si está configurado. El visitante no necesita cuenta: se crea después, desde administración, cuando el piloto avanza.
- `GET /api/v1/admin/leads`, `PATCH /api/v1/admin/leads/:id` — bandeja de solicitudes y su estado (`nuevo`, `contactado`, `interesado`, `piloto_activo`, `cliente`, `descartado`), solo administración.
- `GET /api/v1/dashboard?period=24h|7d|30d` — última lectura, estado, series históricas, resúmenes, previsiones externas disponibles y estaciones cercanas para las estaciones vinculadas al suscriptor.
- `GET /api/v1/alerts` — avisos asociados a las estaciones de la suscripción.
- `GET /api/v1/contacts`, `PUT /api/v1/contacts/:channel` — destinatarios de aviso (`whatsapp`, `email`) con autorización y revocación por canal.
- `POST /api/v1/contacts/:channel/verify`, `POST /api/v1/contacts/:channel/confirm` — verificación por código OTP. Solo se guarda el hash del código y caduca en 10 minutos; el envío real por WhatsApp/email llega con el despachador de la Fase 3. Para probar sin proveedor, activa `OTP_DEBUG=true` en desarrollo (la respuesta incluye `devCode`).
- `GET/POST/PATCH/DELETE /api/v1/farms` y `POST/DELETE /api/v1/farms/:id/devices[/:deviceId]` — fincas del suscriptor y sus estaciones asociadas.
- `GET /api/v1/admin/outbox`, `POST /api/v1/admin/outbox/dispatch` — cola de entrega y disparo manual del despacho (solo administración).
- `GET /api/v1/public/stations`, `GET /api/v1/public/summary` — datos públicos agregados de las estaciones que han autorizado compartir información (nombre/zona, temperatura, humedad, última lectura). **Nunca** coordenadas exactas ni datos personales.
- `POST /api/v1/alerts/:id/test` — envío de prueba de una alerta a la dirección indicada (solo administración).
- `POST /api/v1/whatsapp/webhook` — procesa mensajes entrantes de WhatsApp; `BAJA`/`STOP` revoca el consentimiento del contacto (`opted_out_at`).
- `POST /api/v1/admin/maintenance/retention` — ejecuta la retención de datos (además de `npm run retention`).
- `GET /api/v1/public-config` — datos públicos de contacto (teléfono de soporte); no expone secretos.
- `POST /api/v1/admin/leads/:id/activate` — activación guiada: crea el suscriptor desde una solicitud y devuelve la contraseña temporal una sola vez.
- `POST /api/v1/admin/subscribers/:id/test-message` — envía un mensaje de prueba por el canal configurado del suscriptor.

## SEO y confianza

- Título, descripción, canónica, Open Graph (imagen para WhatsApp) y datos estructurados (LocalBusiness + FAQPage) en `public/index.html`.
- `GET /robots.txt` y `GET /sitemap.xml` se generan en el servidor con `PUBLIC_SITE_URL` (por defecto el dominio de Vercel); en Vercel las dos rutas se reescriben a la función.
- Página **404 real** (`public/404.html`, servida con estado 404 para rutas desconocidas).
- Páginas estáticas de confianza: `/privacidad`, `/cookies`, `/aviso-legal`, `/contacto` (esta última inyecta `SUPPORT_PHONE` desde el entorno).
- Contenido de SEO local en la portada (microclimas de Huéscar, casco urbano frente a vega, estaciones para agricultura, heladas en Granada, estrés térmico del ganado, datos de fincas) y sección de preguntas frecuentes.

## Sección de alertas comprensible

La vista de alertas (`public/js/alert-copy.js`) muestra cada aviso como una tarjeta con **estación, zona, hora, origen, nivel, explicación y estado** (`activa`, `resuelta`, `descartada`), en lugar de códigos técnicos. Ejemplos: "Riesgo de helada — Vega · Temperatura prevista de 1,8 °C · Aviso preventivo…" o "Riesgo de estrés térmico · sombra, agua y ventilación del ganado".

## Página pública y panel privado

La portada `/` es una web pública que no pide sesión; el login solo aparece al entrar en una sección privada. Rutas:

- Públicas: `/` (portada), `/alertas`, `/como-funciona`, `/zonas` (comparación de tres zonas de medición), `/solicitar-piloto`, y el acceso `#/entrar`. La portada incluye el formulario de solicitud repetido en tres puntos y botones "Solicitar piloto" en cada sección; los formularios se generan en `app.js` para no duplicar identificadores.
- Privadas: `#/panel`, `#/estaciones`, `#/avisos`, `#/admin`, `#/cuenta`. Sin sesión se muestra el login; con sesión, la portada redirige al panel.

La SPA usa rutas hash; las rutas "bonitas" (`/panel`, `/zonas`…) se traducen a su equivalente hash al cargar.

## Diseño de las alertas

Una regla no dispara por cualquier cruce del umbral. Cada regla declara:

- **activación**: métrica, comparador, umbral y `min_duration_s` (cuánto debe sostenerse);
- **recuperación**: `recovery_margin` o un `recovery_threshold` explícito, y `recovery_duration_s` (cuánto debe mantenerse la vuelta a la normalidad para cerrar);
- **prioridad** (`level` 1/2) y `urgent` (envío inmediato);
- **cooldown** (`cooldown_s`): tras un aviso, no se repite hasta que pase ese tiempo;
- **category** (`frost`, `heat`, `storm`, `wind`, `humidity`, `general`), que alimenta las preferencias del suscriptor.

Ejemplo de helada, como regla: `temperature <= 2 °C` durante 10 min, recuperación a `>= 3,5 °C` sostenida 15 min, cooldown 2 h. Una alerta preventiva a 2 °C es más útil que avisar con la helada ya en marcha.

Las tormentas locales necesitan pluviómetro, anemómetro y, opcionalmente, datos de rayos; mientras no existan, la web habla de **"avisos oficiales y riesgo meteorológico estimado"**, nunca de detección local precisa.

## Preferencias de alertas por usuario

`GET`/`PUT /api/v1/alert-preferences` guarda qué categorías recibe cada suscriptor, por qué canal, su horario silencioso, zona, cultivo y umbrales propios. La selección de destinatarios (`recipientsForDevice`) aplica esas preferencias: categoría activada, canal activado y respeto del horario silencioso (salvo prioridad 1). Sin fila de preferencias, se recibe todo por los canales verificados.

Los **umbrales propios** (`custom_thresholds`) se guardan y se muestran, pero todavía **no disparan reglas por sí solos**: hoy las reglas son por estación y las gestiona administración. Aplicarlos de forma individual exige evaluar las reglas por suscriptor, que es el siguiente paso.

## Panel orientado a la finca

El panel tiene dos modos:

- **Agricultor** (roles `viewer` y `operator`): primera pantalla guiada, en orden **estado actual → alertas activas → próximo riesgo → comparación entre zonas → histórico → detalles técnicos**. Arriba, siete tarjetas que responden *qué ocurre, desde cuándo, qué significa y qué puede hacer el usuario*: temperatura, humedad, riesgo de helada, riesgo de calor, riesgo de tormenta, última comunicación y estado de la estación. Las gráficas y el detalle técnico quedan al final, plegados. Se calcula en `public/js/farm-cards.js`.
- **Administración** (`admin`): conserva el panel completo con gráficas, estadísticas, reglas, configuración y todas las herramientas.

Las tormentas se muestran siempre como *avisos oficiales y riesgo estimado*: los sensores actuales no permiten una detección local precisa.

## Entrega de avisos

Cuando se abre un aviso, el servidor lo encola en `notification_outbox` para cada suscriptor con un contacto **verificado y autorizado** (WhatsApp preferido sobre email) de esa estación o de su finca. Una pasada periódica entrega la cola con espera creciente (30 s, 60 s… hasta 1 h) y deja el estado en `alerts.delivery_status`. En Vercel la pasada se engancha a peticiones reales, como los detectores de sistema; en proceso largo corre por temporizador.

Elige el proveedor con `WHATSAPP_PROVIDER` (`manual`, `disabled`, `console`, `meta`, `twilio`) y `EMAIL_PROVIDER` (`disabled`, `console`, `resend`). **Sin proveedor no se simula la entrega**: el envío queda pendiente y acaba en `failed`, visible en administración. En desarrollo, `console` imprime el mensaje por el log del servidor.

### Modo piloto: WhatsApp manual, email automático

Para los primeros pilotos, `WHATSAPP_PROVIDER=manual`. En este modo el aviso se genera igual, pero **no se envía solo**: el mensaje queda en estado `manual` y aparece en **Administración → WhatsApp manual**, con el texto ya redactado y un enlace `wa.me`. Se envía a mano desde el teléfono y se marca **Marcar enviado** (o vía `PATCH /api/v1/admin/outbox/:id`). Así se valida la demanda sin asumir la integración de la API de WhatsApp.

El **email** de confirmación y de aviso funciona de forma automática con `EMAIL_PROVIDER` (`resend` en producción). Cuando haya usuarios recurrentes, cambia `WHATSAPP_PROVIDER` a `meta` o `twilio` y la cola se enviará sola.

El mismo canal entrega el código de verificación de contactos. Para probar la verificación sin proveedor, activa `OTP_DEBUG=true` en desarrollo.
- `GET /health` — comprobación de servicio y conexión a Neon.

El panel consulta Open-Meteo para condiciones actuales estimadas y previsiones por hora/día de temperatura, lluvia y viento; cachea las respuestas durante 30 minutos. Las condiciones estimadas nunca se presentan como mediciones de la estación. Además, admite previsión municipal, observaciones de una estación convencional y avisos CAP oficiales de AEMET. Para activarlos, configura `AEMET_API_KEY` como secreto del servidor y completa en la ficha de la estación los códigos municipales, indicativo observador y área de avisos AEMET. Los avisos oficiales se muestran separados de los riesgos orientativos calculados desde la previsión y de los avisos generados por sensores.

Los riesgos orientativos usan umbrales generales (helada, calor, lluvia y rachas) y no son alertas oficiales ni recomendaciones específicas de un cultivo o especie ganadera. Verifica los criterios locales antes de tomar decisiones agronómicas o veterinarias.

La lista de estaciones cercanas incluye únicamente estaciones activas que han permitido compartir datos públicos agregados, vistas en las últimas dos horas y dentro del radio de cobertura configurado. La respuesta solo contiene nombre, última conexión y distancia; nunca entrega las coordenadas exactas de otra estación. El panel indica explícitamente si no hay tres estaciones representativas.

## Seguridad y privacidad

- **El navegador nunca ve secretos**: claves de Neon, tokens de WhatsApp, claves de AEMET, tokens de correo y credenciales de estación viven solo en el entorno del servidor. El frontend habla únicamente con esta API.
- **Consentimiento explícito y revocable**: se guarda con fecha (`consent_at`, `opted_in_at`); se revoca desde la cuenta o respondiendo `BAJA`/`STOP` por WhatsApp (`opted_out_at`).
- **Ubicación**: las rutas públicas no exponen coordenadas exactas; solo zona, lecturas y última conexión.
- **Datos personales**: teléfonos y emails solo se muestran a su dueño y a administración; los leads y la cola están restringidos a `admin`.
- **Retención**: `npm run retention` (o el endpoint admin) elimina leads no convertidos más antiguos que `LEAD_RETENTION_DAYS` (730 por defecto) y envíos cerrados más antiguos que `OUTBOX_RETENTION_DAYS` (90). Las mediciones no se tocan.
- **Límite de acceso**: las bandejas de leads y de entrega requieren rol `admin`; el resto de datos, sesión de suscriptor.

## Seguridad y operación

- Nunca pongas `DATABASE_URL` en el firmware ni en el código cliente.
- Usa un token aleatorio distinto por estación y revócalo poniendo `revoked_at` en `device_credentials` si se pierde.
- No expongas el servidor directamente en HTTP. Configura `TRUST_PROXY=true` solo detrás de un proxy inverso de confianza.
- Crea usuarios mediante el comando de aprovisionamiento; no hay registro público.
- Los intentos de inicio de sesión se limitan por IP y correo normalizado en PostgreSQL (ventana de 15 minutos); ejecuta `npm run migrate` antes de desplegar cambios de esquema.
- Antes de producción, configura proveedor externo, política de retención y revisa los límites de tarifa/uso de Neon.
