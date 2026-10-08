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
- `POST /api/auth/login`, `POST /api/auth/logout` — sesión privada del panel; cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción. Las cuentas creadas por enlace de acceso no tienen contraseña y no pueden iniciar sesión por esta vía.
- `POST /api/auth/magic/request` — solicita un enlace de acceso de un solo uso por email. La respuesta es siempre genérica (no revela si el contacto existe). Limita por IP y email y respeta `MAGIC_RESEND_COOLDOWN_SECONDS` entre reenvíos. **Sin canal de correo utilizable** (`emailDeliveryReady()`: `resend` con clave y remitente, o `console` solo fuera de producción) responde `503 email_delivery_unavailable` y no crea enlaces; un fallo global del canal (proveedor caído o mal configurado) se registra y se comunica igual, eliminando el enlace recién creado si el envío claramente no salió; un rechazo de la dirección concreta sigue respondiendo genérico. `GET /api/v1/public-config` expone `emailAvailable` para que la interfaz cierre la vía y ofrezca atención manual.
- `POST /api/auth/magic/verify` — consume el enlace de forma atómica, abre una sesión y devuelve `{ email, role, plan, next }`. El token caduca (`MAGIC_LINK_TTL_MINUTES`), se guarda solo como hash y se usa una sola vez. Crea cuentas nuevas como `viewer`/`free` sin estaciones; nunca concede rol `admin` ni `operator` (esas cuentas deben entrar con contraseña) y no habilita el envío de alertas. El destino `next` se limita a rutas internas conocidas.
- `POST /api/v1/leads` — captación pública de fincas (CTA "Solicitar piloto"), sin sesión y sin crear cuenta. Campos: nombre, teléfono WhatsApp, email, actividad (`agricultura`, `ganaderia`, `mixta`, `otra`), zona, cultivo o ganado, interés (`heladas`, `calor`, `tormentas`, `viento`, `humedad`, `general`, `futura_instalacion`), notas y consentimiento. La publicidad es una casilla aparte (`commercial_consent`), opcional y sin marcar. `campaign` se sanea a un conjunto limitado de parámetros (utm_*/ref). Limita por IP y teléfono y descarta bots con un campo trampa. Al guardar, registra los consentimientos en el libro (`service` siempre; `commercial` solo si se autorizó) y encola un email de confirmación al visitante (si dejó email) y un aviso interno a los administradores activos y a `ADMIN_NOTICE_EMAIL` si está configurado. El visitante no necesita cuenta: se crea después, desde administración, cuando el piloto avanza, y esa conversión **no** concede publicidad.
- `GET /api/v1/admin/leads`, `PATCH /api/v1/admin/leads/:id` — bandeja de solicitudes con estado (`nuevo`, `contactado`, `interesado`, `piloto_activo`, `cliente`, `descartado`), captación, publicidad por canal y fecha de próximo contacto (`next_contact_at`), solo administración.
- `GET/PUT /api/v1/account/profile` — perfil opcional del suscriptor (municipio, actividad, cultivo o especie, interés). Rellenarlo no condiciona el acceso.
- `GET/POST /api/v1/account/consents` — consentimiento publicitario por canal (finalidad `commercial`). El acceso y la demo funcionan sin autorizarlo. La revocación registra el hecho y cancela los mensajes comerciales pendientes de ese canal.
- `POST /api/v1/admin/subscribers/:id/consents`, `POST /api/v1/admin/leads/:id/consents` — administración concede o revoca publicidad por canal.
- `GET /api/v1/dashboard?period=24h|7d|30d` — última lectura, estado, series históricas, resúmenes, previsiones externas disponibles y estaciones cercanas para las estaciones vinculadas al suscriptor.
- `GET /api/v1/stations/:id/demo-analysis?from=&to=` — análisis de solo lectura para el panel de demostración: mínimas, máximas y medias **con su hora**, resúmenes diarios, punto de rocío **calculado** (método y límites explícitos) y comparación histórica con AEMET. Si no hay 30 días de datos, indica el periodo realmente disponible.
- **Ámbito de demostración (servidor)**: el rol `viewer` del registro público solo accede a las estaciones concedidas explícitamente y a las autorizadas para la demostración (`publish_permission = true`), nunca a todas las privadas. El ámbito se aplica en dashboard, mediciones, exportación CSV, detalle, avisos y estadísticas. El rol de demostración es de solo lectura: sin configuración, control remoto, reglas ni administración.
- `GET /api/v1/alerts` — avisos asociados a las estaciones de la suscripción.
- `GET /api/v1/contacts`, `PUT /api/v1/contacts/:channel` — destinatarios de aviso (`whatsapp`, `email`) con autorización y revocación por canal.
- `POST /api/v1/contacts/:channel/verify`, `POST /api/v1/contacts/:channel/confirm` — verificación por código OTP. Solo se guarda el hash del código y caduca en 10 minutos; el envío real por WhatsApp/email llega con el despachador de la Fase 3. Para probar sin proveedor, activa `OTP_DEBUG=true` en desarrollo (la respuesta incluye `devCode`).
- `GET/POST/PATCH/DELETE /api/v1/farms` y `POST/DELETE /api/v1/farms/:id/devices[/:deviceId]` — fincas del suscriptor y sus estaciones asociadas.
- `GET /api/v1/admin/outbox`, `POST /api/v1/admin/outbox/dispatch` — cola de entrega y disparo manual del despacho (solo administración).
- `GET /api/v1/public/stations`, `GET /api/v1/public/summary` — datos públicos agregados de las estaciones que han autorizado compartir información (nombre/zona, temperatura, humedad, última lectura). **Nunca** coordenadas exactas ni datos personales.
- `POST /api/v1/alerts/:id/test` — envío de prueba de una alerta a la dirección indicada (solo administración).
- `POST /api/v1/whatsapp/webhook` — estados de entrega del proveedor (firma obligatoria) y mensajes entrantes; `BAJA`/`STOP` revoca el consentimiento del contacto (`opted_out_at`).
- `POST /api/v1/email/webhook` — estados de entrega de Resend (esquema SVIX). Firma obligatoria.
- `GET|POST /api/v1/maintenance/scheduler` — ejecuta las pasadas programadas (detectores + cola). Autenticado con `CRON_SECRET`; sin secreto responde `503`. Es el punto de entrada de Vercel Cron o de un cron externo.
- `POST /api/v1/admin/maintenance/retention` — ejecuta la retención de datos (además de `npm run retention`).
- `POST /api/v1/admin/maintenance/scheduler` — dispara las pasadas a mano (solo administración).
- `GET /api/v1/admin/maintenance/limits` — frecuencia, límites HTTP, caducidades y estado del planificador; no expone secretos.
- `GET /api/v1/public-config` — datos públicos de contacto (teléfono de soporte), estado de los canales (`whatsappDelivery`, `emailDelivery`) y `emailAvailable` (si hay canal de correo utilizable); no expone secretos.
- `POST /api/v1/admin/leads/:id/activate` — activación guiada: crea el suscriptor desde una solicitud y devuelve la contraseña temporal una sola vez.
- `POST /api/v1/admin/subscribers/:id/test-message` — envía un mensaje de prueba por el canal configurado del suscriptor.
- `POST /mcp` — servidor MCP (Model Context Protocol) sin estado, de **solo lectura** y para uso interno del administrador: permite que agentes de IA (OpenClaw, Hermes) consulten las estaciones. Autenticación `Authorization: Bearer $MCP_TOKEN`; sin token configurado responde 503 y con token erróneo 401. `GET`/`DELETE` responden 405 (sin SSE). Herramientas: `list_stations`, `get_station_latest`, `get_station_history`, `get_station_summary`, `list_alerts`. Cada llamada queda en el libro de auditoría (`mcp.tool_call`).

### Conectar un agente de IA (OpenClaw / Hermes)

El servidor MCP negocia las versiones de protocolo `2025-03-26` y `2025-06-18`, responde JSON (sin SSE) y no mantiene sesión: cada petición POST es independiente.

OpenClaw (`openclaw.json` o Ajustes → MCP):

```json5
{
  mcp: {
    servers: {
      tecrural: {
        url: "https://tecrural-microestacion.vercel.app/mcp",
        transport: "streamable-http",
        headers: { Authorization: "Bearer ${TECRURAL_MCP_TOKEN}" },
      },
    },
  },
}
```

Hermes (`~/.hermes/config.yaml`):

```yaml
mcp_servers:
  tecrural:
    url: "https://tecrural-microestacion.vercel.app/mcp"
    headers:
      Authorization: "Bearer ${TECRURAL_MCP_TOKEN}"
```

En ambos casos el token es `MCP_TOKEN` del servidor; guárdalo en el gestor de secretos del agente, nunca en el repositorio. Comprobación rápida:

```sh
curl -s https://tecrural-microestacion.vercel.app/mcp \
  -H "Authorization: Bearer $TECRURAL_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Contrato de identidad, tiempo y estado de la estación

- La identidad de muestra que usa hoy el firmware se conserva: `(device_id, sequence, ts)`, equivalente a la clave de almacenamiento `(device_id, sequence, observed_at)`. `sequence` es uint32 persistente en LittleFS; un reinicio normal conserva la secuencia y un reintento debe repetir exactamente el lote. Si se borra/formatea LittleFS, la secuencia puede reiniciar: el timestamp distingue la nueva muestra cuando es hora de epoch. Con `quality=0` el timestamp es uptime, así que un reinicio que borre LittleFS podría colisionar con una muestra anterior idéntica; el servidor la tratará como repetición idempotente, ya que el firmware actual no transmite un identificador de arranque. No se altera la identidad ni el ACK `ack_through` en esta fase.
- Las muestras repetidas no se procesan dos veces. Las muestras desordenadas o históricas válidas se conservan como histórico, pero no abren ni resuelven alertas actuales. Solo una muestra con al menos un canal admisible, hora utilizable, timestamp reciente y posterior a la última muestra validada se evalúa por el motor.
- Cada canal se valida por separado. Un valor imposible o un canal que el firmware marca inválido se pone a `NULL` en su columna, se conserva en `raw_payload` con sus flags/motivo y no llega al motor; los otros canales válidos de esa misma muestra siguen siendo utilizables. La hora sin referencia (`quality=0`) y timestamps más de 5 minutos en el futuro se guardan para diagnóstico, pero no cuentan como dato actual.
- `last_contact` se actualiza al recibir una petición autenticada del equipo, también al consultar configuración. `last_valid_data` solo avanza con mediciones utilizables. La conexión se calcula con `sync_interval_s`: online hasta 1,5× el intervalo + 5 min, degradada hasta 3× + 5 min y desconectada después. La antigüedad de datos se calcula aparte desde `interval_normal_s`.

## SEO y confianza

- Título, descripción, canónica, Open Graph (imagen para WhatsApp) y datos estructurados (LocalBusiness + FAQPage) en `public/index.html`.
- `GET /robots.txt` y `GET /sitemap.xml` se generan en el servidor con `PUBLIC_SITE_URL` (por defecto el dominio de Vercel); en Vercel las dos rutas se reescriben a la función.
- Página **404 real** (`public/404.html`, servida con estado 404 para rutas desconocidas).
- Páginas estáticas de confianza: `/privacidad`, `/cookies`, `/aviso-legal`, `/contacto` (esta última inyecta `SUPPORT_PHONE` desde el entorno).
- Contenido de SEO local en la portada (microclimas de Huéscar, casco urbano frente a vega, estaciones para agricultura, heladas en Granada, estrés térmico del ganado, datos de fincas) y sección de preguntas frecuentes.

## Sección de alertas comprensible

La vista de alertas (`public/js/alert-copy.js`) muestra cada aviso como una tarjeta con **estación, zona, hora, origen, nivel, explicación y estado** (`activa`, `resuelta`, `descartada`), en lugar de códigos técnicos. La explicación **cita siempre el dato observado o la previsión que origina el aviso**; nunca promete "detectamos que viene una helada".

## Avisos de esta versión (Fase 8)

`public/js/notice-taxonomy.js` (importado también por `src/notify.js` y `src/magic-link.js`) define los avisos que existen en esta versión y lo que cada uno declara: **categoría, fuente, fecha, estado y vigencia**, más la clase de afirmación, que es lo que la aceptación pide poder distinguir de un vistazo:

| Tipo | Categoría | Naturaleza | Comportamiento inicial |
| --- | --- | --- | --- |
| Datos antiguos o estación caída | `status` | real | Aviso de estado en la interfaz |
| Riesgo por previsión externa | `forecast` | previsto (o `calculado` si es estimación propia) | Información orientativa con proveedor nombrado (AEMET / Open-Meteo) |
| Umbral local real | `threshold` | real | Solo se muestra cuando el motor está comprobado (`ALERT_ENGINE_VERIFIED`) |
| Aviso agrícola simulado | `simulated` | simulado | Solo dentro de `#/demo-agricola`; nunca llega al panel |
| Novedades comerciales | `commercial` | comunicación | Solo con autorización específica por canal |
| Enlace o código de acceso | `access` | comunicación | Comunicación necesaria para autenticar |

Reglas que se aplican en servidor y en interfaz:

- **"Sin avisos" nunca significa "sin riesgo"** cuando faltan datos o cae un proveedor: `coverageCaveat(devices)` devuelve los huecos (estaciones sin conexión, sin mediciones recientes, sin sensor de temperatura o con la previsión caída) y el panel, el centro de avisos y la tarjeta "próximo riesgo" lo muestran en lugar del "todo tranquilo". Si todos los datos están completos, se puede afirmar.
- **El motor solo se presenta como tal cuando está comprobado**: `ALERT_ENGINE_VERIFIED` (por defecto `true`, `.env.example`) se expone como `engine_verified` en `/api/v1/dashboard` y `/api/v1/alerts`. Con `false`, los avisos con `rule_id` (umbral local) no se muestran a los visitantes y se indica cuántos se han ocultado. Las marcas enviadas por el propio equipo (sin regla) no son umbral local y siguen visibles.
- **WhatsApp manual no se anuncia como automático**: `/api/v1/public-config` publica `whatsappDelivery` y, mientras sea `manual`, la cuenta y el centro de avisos muestran `WHATSAPP_MANUAL_NOTE`. Ningún cuerpo de mensaje promete entrega automática.
- **Mensajes técnicos separados de la información útil**: la tabla con regla, destinatario, canal, entrega y JSON crudo solo se ve con rol `admin`/`operator`; el rol de demostración ve tarjetas con los cinco datos. Los avisos de comunicación (sin conexión) siguen reservados a administración.
- **La naturaleza también se muestra en las tarjetas del panel**: cada tarjeta de riesgo lleva una insignia `Real`, `Previsto` o `Calculado` (o ninguna si no hay dato con el que afirmar algo), con la definición en el tooltip.
- **Ámbito de avisos distinto al de datos**: `alertableDeviceIds` (`src/auth.js`) limita los avisos a las estaciones **concedidas**. Registrarse en la demostración no suscribe a los avisos de la estación urbana (`publish_permission`), y `recipientsForDevice` solo mira `subscriber_devices`/`farm_devices`, así que tampoco se da de alta en la cola de envíos.

## Página pública y panel privado

La portada `/` es una web pública que no pide sesión; el login solo aparece al entrar en una sección privada. Rutas:

- Públicas: `/` (portada), `/alertas`, `/como-funciona`, `/zonas` (comparación de tres zonas de medición), `/demo-agricola` (demostración agrícola **simulada**), `/solicitar-piloto`, y el acceso `#/entrar`. La portada incluye el formulario de solicitud repetido en tres puntos y botones "Solicitar piloto" en cada sección; los formularios se generan en `app.js` para no duplicar identificadores.
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

## Demostración agrícola simulada (Fase 7)

La portada incluye `#/demo-agricola`, una demostración interactiva para trasladar la utilidad urbana a una futura instalación en finca. Todo el cálculo ocurre en el navegador (`public/js/farm-sim.js`):

- **Tres escenarios con datos ilustrativos**, generados a partir de puntos de control fijos y **completamente independientes de las mediciones reales**: *Noche fría* (descenso nocturno y cruce de umbral), *Jornada calurosa* (temperatura elevada sostenida) y *Zonas de una finca* (hondonada frente a zona alta).
- **Umbral ajustable por escenario**: al mover el deslizador se recalcula la hora a la que se generaría el aviso, los tramos por encima o por debajo del umbral y su duración.
- **En la noche fría se distinguen las tres fuentes**: previsión externa (ilustrativa), descenso observado (simulado) y umbral local (el que elige el visitante), con su curva y su hora de cruce por separado.
- **En ganadería solo se habla de condiciones ambientales y riesgo orientativo de estrés térmico** (`heatStressNote`): temperatura por encima del umbral durante un tiempo, con recomendaciones genéricas de sombra, agua y ventilación. Nunca diagnostica un golpe de calor ni presenta el umbral como recomendación agronómica universal.
- **El emplazamiento se explica en el propio escenario**: una estación representa su punto de medida y comparar sectores distintos exige un sensor en cada uno.
- **La interacción no toca el servidor**: el módulo no hace `fetch`, no llama a `/api/`, no inserta avisos ni modifica configuraciones (lo cubre una prueba que inspecciona el código fuente). Tras explorar, se revela el formulario público de captación precargado con el interés `futura_instalacion`, para completar municipio, cultivo o ganado.

## Ejecución programada y latencia esperada (Fase 9)

Los detectores de sistema (desconexión, batería) y la cola de entrega ya **no dependen de las visitas al panel**. Hay tres caminos, y el orden del middleware también se corrigió (el *respaldo* estaba montado **después** de las rutas, así que las peticiones que respondían —el dashboard incluido— nunca lo alcanzaban; ahora va al principio de la aplicación):

| Camino | Cuándo | Configuración |
| --- | --- | --- |
| **Disparo externo (n8n o cron externo)** — **mecanismo efectivo** | servidor sin proceso propio (este despliegue) | `CRON_SECRET`; sin secreto responde `503`. Workflows listos en `docs/n8n-planificador.json` y `docs/n8n-avisos.json` |
| Temporizador (`startScheduler`) | proceso largo (`npm start`, Node) | `SYSTEM_EVAL_INTERVAL_S`, `OUTBOX_EVAL_INTERVAL_S`, `OUTBOX_BATCH_SIZE` |
| `schedulerRequestTick` (respaldo, **desactivado por defecto**) | cualquier petición a `/api/…` | `SCHEDULER_REQUEST_TICK=true` lo activa |

- **No hay cron de Vercel**: el plan gratuito solo admite un disparo diario y no se usa para avisos. La latencia la marca el intervalo del disparador externo (con n8n cada 5 min, entrega y desconexión tardan como mucho ese intervalo más la pasada). Sin disparador externo y sin respaldo por tráfico **no hay pasadas ni entrega**.
- **Presupuesto por invocación**: en serverless cada llamada procesa **una fila** de la cola por defecto (`maxDuration` 30 s). El disparo externo puede pedir más con `?outbox=N` (1–20, acotado) o repetir la llamada hasta vaciar la cola. La exclusión real la dan `FOR UPDATE SKIP LOCKED` y el bloqueo de filas de regla: repetir la llamada nunca duplica envíos ni episodios.
- **Monitorización**: `GET /api/v1/maintenance/status` con `CRON_SECRET` devuelve recuento de la cola por estado, **antigüedad del elemento pendiente más viejo**, alertas abiertas (hasta 50) y configuración efectiva. `GET /api/v1/admin/maintenance/limits` documenta intervalos, límites HTTP, caducidades, el bloque `mechanism` (mecanismo efectivo) y el estado del planificador; `POST /api/v1/admin/maintenance/scheduler` permite dispararla a mano.
- **Aceptación sugerida**: con diez destinatarios en cola y n8n a 5 min con `outbox=10`, toda la cola se procesa en la primera pasada; los códigos llegan antes de caducar (`MESSAGE_TTL_MINUTES`); medir la latencia por separado desde la observación, desde la recepción y desde la apertura del episodio.
- **Latencia esperada**:
  - disparo externo (n8n cada 5 min) → hasta 5 min más la duración de la pasada;
  - reintentos fallidos → **30 s, 60 s, 120 s… hasta 1 h**, con un tope de 5 intentos.

### Programar el disparo con n8n

1. Importa `docs/n8n-planificador.json` en tu n8n: dispara cada 5 min y llama a `POST /api/v1/maintenance/scheduler?outbox=10` con `Authorization: Bearer <CRON_SECRET>`.
2. Define la variable de entorno `TECRURAL_CRON_SECRET` en n8n con el mismo valor que `CRON_SECRET` en Vercel, y ajusta la URL si usas dominio propio.
3. (Opcional) Importa `docs/n8n-avisos.json` para sondear `GET /api/v1/maintenance/status` cada 2 min y añadir un paso que empuje las `openAlerts` a Telegram/WhatsApp/email; un agente de IA también puede leerlas por el servidor MCP (`list_alerts`).
4. (Recomendado como red de seguridad) Activa `SCHEDULER_REQUEST_TICK=true` en Vercel: cualquier petición a la API da un empujón a las pasadas (con el mismo tope de 60 s), de modo que si n8n se cae, el tráfico del panel mantiene el servicio.

**Si necesitas menos latencia sin subir de plan**: el endpoint está protegido por `CRON_SECRET` y funciona con cualquier planificador externo; ajusta el intervalo del workflow al objetivo de latencia acordado.

## Entrega de avisos

Cuando se abre un aviso, el servidor lo encola en `notification_outbox` para cada suscriptor con un contacto **verificado y autorizado** (WhatsApp preferido sobre email) de esa estación o de su finca. La entrega corre en la pasada programada de arriba, con espera creciente (30 s, 60 s… hasta 1 h) y deja el estado en `alerts.delivery_status`.

Garantías de la cola (`src/notify.js`):

- **Exclusión entre trabajadores**: el reclamo usa `FOR UPDATE SKIP LOCKED` y marca `claimed_by`/`claimed_at`. Dos procesos no cogen la misma fila. Un reclamo que supera `SENDING_TIMEOUT_MS` (10 min, por encima del peor caso de un lote local) **no se reenvía a ciegas**: se marca `failed` con motivo «aceptación del proveedor incierta», para que un webhook tardío o un operador lo resuelva sin duplicar.
- **Reintentos limitados y caducidad**: máximo 5 intentos con backoff (30 s, 60 s…), y cada mensaje guarda `expires_at` (`ALERT_MESSAGE_TTL_MINUTES`, `VERIFICATION_TTL_MINUTES`, `COMMERCIAL_MESSAGE_TTL_MINUTES`). Un barrido previo al reclamo aparta lo caducado como `expired`; **no se envía**.
- **Revisión antes de enviar**: la publicidad revalida el consentimiento, los avisos revalidan que el contacto siga autorizado, verificado y sin darse de baja, y los códigos revalidan que la verificación siga viva. Lo revocado pasa a `cancelled`.
- **Una vez por destinatario**: el incidente se deduplica por episodio (`alerts.dedupe_key`) y cada destinatario recibe **una** fila de cola. Las marcas de alerta del firmware ya no crean un segundo incidente: los avisos locales solo salen del motor de reglas.
- **Aceptado ≠ entregado**: `sent` es que el proveedor aceptó la llamada (2xx + id); `delivered` solo lo declara el proveedor por webhook. `alerts.delivery_status` sigue la misma regla.

Elige el proveedor con `WHATSAPP_PROVIDER` (`manual`, `disabled`, `console`, `meta`, `twilio`) y `EMAIL_PROVIDER` (`disabled`, `console`, `resend`). **Sin proveedor no se simula la entrega**: el envío queda pendiente y acaba en `failed`, visible en administración. En desarrollo, `console` imprime el mensaje por el log del servidor. **Con `EMAIL_PROVIDER=disabled` la vía de acceso por enlace queda cerrada de forma segura**: el endpoint responde `503 email_delivery_unavailable` y la interfaz ofrece solicitud de acceso con atención manual en su lugar.

### Webhooks de entrega autenticados

Los webhooks confirman la entrega y exigen la **firma del proveedor** sobre el cuerpo crudo (`req.rawBody`):

- `POST /api/v1/whatsapp/webhook` — `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET` (Meta) o `X-Twilio-Signature` con `TWILIO_AUTH_TOKEN`. Sin ninguno de los dos, solo se acepta con `WHATSAPP_WEBHOOK_TOKEN`; sin nada configurado, `403`. Sigue atendiendo los mensajes entrantes (`BAJA`/`STOP`).
- `POST /api/v1/email/webhook` — esquema SVIX de Resend (`svix-id`, `svix-timestamp`, `svix-signature`) con `RESEND_WEBHOOK_SECRET` y tolerancia de 5 minutos. Sin secreto, `503`.
- Firma inválida → `401 bad_signature`; el cuerpo no procesado no cambia ningún estado.

Toda llamada externa sale con tiempo máximo en `src/http-limits.js`: `HTTP_TIMEOUT_MS` = 8 s para recibir cabeceras y `HTTP_MAX_MS` = 15 s para la llamada completa (incluido el cuerpo). Un 429 se reintenta desde la cola; un 5xx o un tiempo agotado **no** se reenvía a ciegas (el proveedor pudo aceptar el mensaje), se marca `failed` con motivo de resultado incierto y lo resuelve el webhook o una persona.

### Modo piloto: WhatsApp manual, email automático

Para los primeros pilotos, `WHATSAPP_PROVIDER=manual`. En este modo el aviso se genera igual, pero **no se envía solo**: el mensaje queda en estado `manual` y aparece en **Administración → WhatsApp manual**, con el texto ya redactado y un enlace `wa.me`. Se envía a mano desde el teléfono y se marca **Marcar enviado** (o vía `PATCH /api/v1/admin/outbox/:id`). Así se valida la demanda sin asumir la integración de la API de WhatsApp.

El **email** de confirmación y de aviso funciona de forma automática con `EMAIL_PROVIDER` (`resend` en producción). Cuando haya usuarios recurrentes, cambia `WHATSAPP_PROVIDER` a `meta` o `twilio` y la cola se enviará sola.

El mismo canal entrega el código de verificación de contactos. Para probar la verificación sin proveedor, activa `OTP_DEBUG=true` en desarrollo.
- `GET /health` — comprobación de servicio y conexión a Neon.

## Verificación y publicación

Scripts de aceptación contra un entorno de prueba local (servidor propio en un puerto libre, datos con prefijo que se limpian al terminar, sin comunicaciones reales):

```sh
npm run acceptance           # primera fase: identidad, config y ámbito
npm run acceptance:phase13   # 12 recorridos de la Fase 13
```

Antes de desplegar, consulta `docs/publicacion.md`: migración aditiva e idempotente, copia de seguridad con Neon/PITR y `pg_dump`, comprobaciones posteriores y reversión.

El panel consulta Open-Meteo para condiciones actuales estimadas y previsiones por hora/día de temperatura, lluvia y viento; cachea las respuestas durante 30 minutos. Las condiciones estimadas nunca se presentan como mediciones de la estación. Además, admite previsión municipal, observaciones de una estación convencional y avisos CAP oficiales de AEMET. Para activarlos, configura `AEMET_API_KEY` como secreto del servidor y completa en la ficha de la estación los códigos municipales, indicativo observador y área de avisos AEMET. Los avisos oficiales se muestran separados de los riesgos orientativos calculados desde la previsión y de los avisos generados por sensores.

La comparación de temperatura local–AEMET usa la observación convencional más próxima a la última medición local válida, únicamente si ambas marcas temporales difieren como máximo ±10 minutos. El valor se puede ajustar con `AEMET_COMPARISON_WINDOW_MINUTES` (1–60; por defecto 10). La diferencia se define como microestación menos AEMET, por lo que puede ser positiva o negativa. Fuera de esa ventana se muestran ambas lecturas y sus horas, sin diferencia directa. La temperatura local de portada/panel no se sustituye por la observación AEMET. Las fechas AEMET sin zona horaria se interpretan en `Europe/Madrid`; las que incluyen offset conservan el instante declarado.

Los avisos CAP de AEMET separan tres conceptos que no deben mezclarse: el **área de descarga** (`esp` o el código de CCAA, p. ej. `61` Andalucía — es lo que admite `/avisos_cap/ultimoelaborado/area/{area}` según la especificación OpenData), la **zona de aviso CAP** (p. ej. `611802`, el geocódigo que FILTRA los mensajes relevantes y el que se configura en la ficha como `aemet_warning_area`) y la **ubicación** (coordenadas privadas de la estación, para la verificación por geometría). El área de descarga se deriva del prefijo de la zona; `aemetConfigForDevice` devuelve ambas (`warningZone` + `downloadArea`). El recurso descargado es un **tar** (`application/x-gtar`, opcionalmente gzip) con ficheros CAP v1.2 XML: se desempaqueta (`aemet-cap.js`) antes de interpretar cada mensaje. Los avisos usan el resultado CAP, filtran vigencia (`effective`/`onset`/`expires`), cancelaciones y actualizaciones por `references`, verifican geometrías CAP `polygon`/`circle` contra las coordenadas privadas cuando el mensaje las incluye y descartan por geocódigo de zona los mensajes de zonas ajenas. Una respuesta válida sin avisos significa “sin avisos vigentes”; un **HTTP 404 significa “sin datos”** (estado `empty`: la consulta fue válida pero AEMET no devolvió nada — **nunca** se interpreta como ausencia de avisos); un fallo conserva la última respuesta utilizable y muestra su antigüedad como obsoleta. Previsión, observaciones y avisos llevan estados independientes (`forecastStatus`, `observationStatus`, `warningsStatus`) y la respuesta pública expone `warningsAreaCode` (zona) y `warningsDownloadArea` (área).

Los riesgos orientativos usan umbrales generales (helada, calor, lluvia y rachas) y no son alertas oficiales ni recomendaciones específicas de un cultivo o especie ganadera. Verifica los criterios locales antes de tomar decisiones agronómicas o veterinarias.

La lista de estaciones cercanas incluye únicamente estaciones activas que han permitido compartir datos públicos agregados, vistas en las últimas dos horas y dentro del radio de cobertura configurado. La respuesta solo contiene nombre, última conexión y distancia; nunca entrega las coordenadas exactas de otra estación. El panel indica explícitamente si no hay tres estaciones representativas.

## Seguridad y privacidad

- **El navegador nunca ve secretos**: claves de Neon, tokens de WhatsApp, claves de AEMET, tokens de correo y credenciales de estación viven solo en el entorno del servidor. El frontend habla únicamente con esta API.
- **Consentimiento explícito y revocable**: los avisos se guardan con fecha (`opted_in_at`) y se revocan desde la cuenta o respondiendo `BAJA`/`STOP` por WhatsApp (`opted_out_at`). La publicidad vive aparte, en `consent_records`, con finalidad, canal, fecha y versión del texto (`CONSENT_TEXT_VERSION`); el acceso no depende de ella y la revocación cancela los envíos comerciales pendientes. Antes de enviar un mensaje comercial se revalida el consentimiento.
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
- El acceso sin contraseña usa enlaces de un solo uso: token aleatorio de 32 bytes, guardado solo como hash, caducidad de 15 minutos y consumo atómico. El email es único ignorando mayúsculas y espacios (`subscribers.email_normalized`); si al migrar hay duplicados normalizados, la migración falla y hay que resolverlos a mano. `npm run retention` limpia enlaces de acceso con más de un día.
- `EMAIL_PROVIDER=console` solo imprime el enlace de acceso fuera de producción; en producción ese proveedor no se considera una entrega válida. `OTP_DEBUG` se ignora en producción (también con `VERCEL_ENV=production`).
- Antes de producción, configura proveedor externo, política de retención y revisa los límites de tarifa/uso de Neon.
