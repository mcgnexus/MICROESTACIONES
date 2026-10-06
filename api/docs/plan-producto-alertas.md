# Plan de producto · TecRural como servicio de alertas por WhatsApp

## 1. Definición del producto

La aplicación no vende "datos meteorológicos": vende **alertas meteorológicas de la finca por
WhatsApp** para anticiparse a heladas, calor y episodios adversos.

### Público inicial

- Pequeños agricultores.
- Ganaderos.
- Explotaciones familiares.
- Personas que no quieren analizar gráficas complejas.

### Acción principal

El botón principal de la web es **"Quiero recibir alertas de mi finca"**, no "Iniciar sesión".
El login es secundario, para clientes o pilotos ya activados.

### Canales

| Canal | Uso |
|---|---|
| WhatsApp | alertas urgentes |
| Email | resumen y confirmaciones |
| Panel web | históricos y detalle |
| Teléfono | soporte o venta manual |

---

## 2. Diagnóstico del estado actual

| Pieza | Hoy | Cambio que exige la definición |
|---|---|---|
| Entrada | `api/public/index.html:37-47` es login-first | Landing pública con CTA y login secundario |
| Alta de finca | `POST /api/v1/pilot-requests` exige `requireSubscriber` (`api/src/account.js:50`) | Captación pública sin cuenta |
| Canales | `alert_rules.channel`/`alerts.channel` solo admiten `email, sms, webhook, push, in_app` (`api/src/schema.sql:117,149`) | Añadir `whatsapp` |
| Entrega | `delivery_status` existe pero nadie envía nada | Dispatcher real WhatsApp + Email |
| Modelo | No hay finca, ni teléfono, ni preferencias de canal | Tablas `farms`, contactos y consentimiento |
| Panel | Centrado en gráficas y detalle técnico (`panel.js`, `stations.js`) | Centrado en "mis alertas" y estado de la finca |

**Límite de honestidad técnica** (documentado en `api/docs/avisos-estadisticas-ia.md:83-94`): los
sensores solo miden temperatura, humedad, presión, batería y lux. Se puede prometer **helada y calor
porque la temperatura sí se mide**; lluvia, viento o "episodios adversos" solo pueden venir de
previsión externa (Open-Meteo/AEMET) y deben mostrarse etiquetados como previsión, nunca como
medición de la finca.

---

## 3. Fase 0 — Fijar la promesa y los límites (sin código)

- Promesa principal: *"Alertas de helada y calor extremo de tu finca por WhatsApp, antes de que ocurran."*
- Promesa secundaria: *"Aviso cuando tu estación deja de enviar o se queda sin batería."*
- Fuera de alcance explícito: lluvia/viento propios (no hay sensor), predicción agronómica por cultivo.
- Definir plan comercial (p. ej. `free` = panel, `pro` = WhatsApp) sobre el campo `plan` existente.
- Criterio de salida: una frase de producto y una lista de lo que NO se afirma.

---

## 4. Fase 1 — Landing pública y captación de fincas

### Frontend

- `index.html`: separar en tres vistas: `#landing-view` (pública), `#login-view`, `#view-root`.
- Hero con CTA grande **"Quiero recibir alertas de mi finca"**; enlace discreto
  *"Soy cliente o piloto: entrar"* que abre `#/entrar`.
- Formulario de alta: nombre, **teléfono WhatsApp**, municipio/finca, tipo (agricultura/ganadería),
  cultivo/ganado, consentimiento expreso de comunicaciones.
- `app.js`: enrutador que decide público vs privado; el login deja de ser la pantalla por defecto.

### Backend

- Migración en `schema.sql` + `migrate.js`: tabla `farm_leads`
  (`id`, `name`, `phone`, `municipality`, `farm_type`, `crop`, `notes`, `consent`, `consent_at`,
  `status`, `created_at`, `source`).
- `POST /api/v1/leads` **público**: validación zod, límite de tasa por IP (reutilizar patrón de
  `login-rate-limit.js`), honeypot anti-bot, consentimiento obligatorio, sin CSRF (no hay sesión).
- `GET /api/v1/admin/leads` y `PATCH /api/v1/admin/leads/:id` para que soporte convierta lead en
  suscriptor/estación.

**Verificación**: tests de contrato del endpoint (zod, consentimiento requerido, rate limit) con
`npm test`; landing navegable sin sesión.

---

## 5. Fase 2 — Finca, destinatarios y consentimiento

- Migración: añadir `whatsapp` al `CHECK` de `alert_rules.channel` y `alerts.channel`.
- Nueva tabla `farms` (`id`, `subscriber_id`, `name`, `municipality`, `lat/lon`, `crop`, `livestock`)
  y relación finca↔estación.
- Tabla `subscriber_contacts` (`subscriber_id`, `channel`, `address`, `verified_at`, `opted_in_at`,
  `opted_out_at`) para no mezclar email y WhatsApp.
- UI en `account.js`: teléfono WhatsApp, verificación por código (OTP de un solo uso), preferencias
  por canal, y baja de canal.
- Alta manual: comando `create-user` extendido o flujo admin desde el lead.

**Criterio**: un cliente puede activar "alertas por WhatsApp" y revocarlas; `audit_logs` registra cada
cambio de consentimiento.

---

## 6. Fase 3 — Dispatcher de alertas (WhatsApp urgente, Email resumen)

- Nuevo módulo `src/notify.js` + cola de entrega (tabla `notification_outbox` con `status`,
  `attempts`, `next_attempt_at`, `last_error`).
- Al crear un `alerts` (`server.js:148` y `alert-engine.js`), encolar entrega solo si hay contacto
  verificado y consentimiento, y solo para canales configurados.
- **WhatsApp**: WhatsApp Business Cloud API (Meta) o proveedor (Twilio); plantillas aprobadas;
  mensaje en lenguaje llano con nombre de finca, qué pasa y recomendación simple; soporte de "BAJA".
- **Email**: proveedor transaccional para confirmaciones y resumen diario/semanal.
- Actualizar `alerts.delivery_status`/`delivered_at` con reintentos y backoff; en serverless,
  procesar la cola desde una pasada periódica como hace `runSystemPass` (`server.js:629`).
- Priorizar por `alert.level` (prioritario = envío inmediato, aviso = agrupado).

**Criterio**: una alerta de helada generada por regla llega por WhatsApp al número verificado y su
estado queda en `delivered`/`failed` con traza.

---

## 7. Fase 4 — Panel reorientado a la finca

- "Mis alertas" arriba y en primer plano; estado de la finca (helada/calor, conectividad, batería) en
  lenguaje no técnico.
- Gráficas y detalle estadístico pasan a segundo nivel (`stations.js`, `statistics.js`).
- Vista móvil prioritaria; textos cortos; sin jerga.

---

## 8. Fase 5 — Venta y soporte manual

- Teléfono visible en la landing y en el panel.
- Admin: bandeja de leads, activación guiada, y envío de prueba de WhatsApp.
- Aviso legal en cada alerta: servicio orientativo, no oficial; verificar criterios locales.

---

## 9. Transversal

- **RGPD**: consentimiento explícito, revocable, registrado en `audit_logs`; retención y política de
  privacidad enlazada desde la landing.
- **Seguridad**: el endpoint de leads es público, así que rate limit + honeypot + tamaño de payload;
  mantener CSP y `no-store`.
- **No regresión**: conservar el motor de avisos y sus límites; todo lo que suene a "predicción" debe
  etiquetarse por proveedor.

---

## 10. Orden recomendado y estimación

1. Fase 1 (1-2 días) — máxima visibilidad de producto sin tocar el motor.
2. Fase 2 (2-3 días) — modelo y consentimiento.
3. Fase 3 (4-6 días) — la integración de WhatsApp es el grueso real (alta de cuenta, plantillas, cola).
4. Fases 4-5 (2-3 días) — pulido y operación.
