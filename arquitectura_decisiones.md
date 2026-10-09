# Arquitectura y registro de decisiones — TecRural Microestación

Fecha: 2026-10-09
Estado: propuesta para el piloto

## 1. Arquitectura elegida

**Aplicación modular con una única base PostgreSQL**, manteniendo Node.js, Express, el cliente PostgreSQL (`postgres`) y la validación con Zod. La interfaz se reorganiza con HTML, CSS y JavaScript modular (PWA). No se exige migrar a React o Next.js.

```
Navegador ──HTTP──▶ API (Express) ──▶ PostgreSQL (Neon)
Estación  ──HTTP──▶ API (recepción autenticada)
Planificador (n8n/cron) ──▶ API (tareas periódicas)
API ──▶ AEMET / Open-Meteo / WhatsApp / Email   (solo desde el servidor)
```

Reglas:
- El navegador solo habla con la API.
- La API controla permisos y es el único acceso a PostgreSQL.
- Las estaciones usan recepción autenticada por token.
- Los proveedores externos solo se consultan desde el servidor.
- Un programador independiente ejecuta las tareas periódicas.

## 2. Mapa de módulos

| Módulo | Responsabilidad | Archivos actuales |
| --- | --- | --- |
| Interfaz pública | Tiempo local, comparación, explicación, captación | `public/`, `views/`, `public/js/` |
| Identidad y acceso | Registro, verificación, sesiones, permisos, derechos | `auth.js`, `magic-link.js`, `security.js`, `login-rate-limit.js` |
| Estaciones e instalaciones | Dispositivos, emplazamientos, asignación, mantenimiento | `stations.js`, `farms.js`, `device-config.js`, `provision-device.js` |
| Mediciones | Recepción, almacenamiento, calidad, muestreo, histórico | `contracts.js`, `validation.js`, `measurement-policy.js`, `statistics.js`, `retention.js` |
| Fuentes externas | Adaptadores de observaciones, previsión y avisos AEMET | `weather.js`, `aemet-cap.js`, `http-limits.js` |
| Comparaciones | Emparejamiento temporal y resultados reproducibles | `weather.js` (comparación), `statistics.js` |
| Avisos locales | Reglas, episodios, recuperación, datos recientes | `alert-engine.js`, `alert-rules`, `alert-preferences.js`, `alert-visibility.js` |
| Entregas | Cola persistente, intentos, caducidad, confirmaciones | `notify.js`, `notification-provider.js`, `whatsapp.js`, `email.js`, `webhooks.js`, `message-ttl.js` |
| Captación y servicio | Solicitudes, seguimiento comercial, contratos de piloto | `leads.js`, `prospects.js`, `prospect-policy.js`, `consent.js`, `analytics.js` |
| Operación | Tareas periódicas, diagnóstico, auditoría, retención, métricas | `scheduler.js`, `admin.js`, `audit.js`, `retention.js`, `mcp.js` |

## 3. Registro de decisiones (ADR)

### ADR-001: Reorganizar la aplicación existente

| Campo | Contenido |
| --- | --- |
| Decisión | Reorganizar la aplicación actual en módulos, sin reescribir |
| Motivo | Conserva la integración con estaciones y reduce la migración |
| Alternativas | Reescribir con React/Next.js; dividir en microservicios |
| Condición para revisar | Una dificultad concreta demostrada que justifique el coste de migrar |

### ADR-002: Una única base PostgreSQL

| Campo | Contenido |
| --- | --- |
| Decisión | Mantener una sola base PostgreSQL (Neon) |
| Motivo | El volumen de dos pilotos no justifica otra base; el esquema ya es aditivo |
| Alternativas | Base de series temporales; Redis para caché/colas |
| Condición para revisar | Medición que demuestre saturación o latencia inaceptable |

### ADR-003: Sin Redis, tiempo real ni colas externas

| Campo | Contenido |
| --- | --- |
| Decisión | No añadir Redis, bases de series temporales, servicios de tiempo real ni colas externas |
| Motivo | La cola de entrega ya es persistente en PostgreSQL; el planificador es externo (n8n) |
| Alternativas | Redis/BullMQ; Kafka; websockets |
| Condición para revisar | Necesidad medida de menor latencia o mayor volumen que la base no cubra |

### ADR-004: Interfaz HTML/CSS/JS modular (PWA)

| Campo | Contenido |
| --- | --- |
| Decisión | Mantener HTML, CSS y JavaScript modular; PWA instalable |
| Motivo | No exige migración ni aprendizaje; sirve a visitante, cuenta y cliente |
| Alternativas | React/Next.js; apps nativas |
| Condición para revisar | Requisito de interfaz o rendimiento que el enfoque actual no cubra |

### ADR-005: Node.js con soporte vigente y versiones fijadas

| Campo | Contenido |
| --- | --- |
| Decisión | Node.js ≥ 20 (LTS vigente), compatible con Vercel; dependencias fijadas |
| Motivo | Seguridad y reproducibilidad; el alojamiento ya soporta Node 20 |
| Alternativas | Otras versiones de Node; otros runtimes |
| Condición para revisar | Cambio de alojamiento o fin de soporte de la versión |

### ADR-006: Regiones próximas

| Campo | Contenido |
| --- | --- |
| Decisión | Servidor y base de datos en regiones próximas |
| Motivo | Reduce latencia entre función y base |
| Alternativas | Regiones lejanas por coste |
| Condición para revisar | Si el coste lo exige, medir el impacto antes de mover |

### ADR-007: Módulos aislados con contratos revisados

| Campo | Contenido |
| --- | --- |
| Decisión | Aislar módulos y revisar contratos heredados antes de simplificar |
| Motivo | Evitar que un cambio de interfaz rompa el protocolo de las estaciones |
| Alternativas | Refactor global sin aislamiento |
| Condición para revisar | Cuando los contratos de firmware y API estén versionados y probados |

## 4. Condiciones de validación

| Garantía | Cómo se comprueba |
| --- | --- |
| Un cambio en la interfaz no modifica el protocolo de una estación | Contrato `/api/measurements` y `/api/config` con test dedicado (`contracts.test.js`, `stations.test.js`) |
| Un fallo de AEMET no impide consultar los datos locales | La comparación es dato externo opcional; el dato local se sirve aunque AEMET falle (`weather.js` aísla errores) |
| Un fallo de envío no pierde una medición | La medición se persiste antes de evaluar avisos; el envío fallido solo afecta a `notification_outbox` |

## 5. Dependencias actuales (fijadas)

| Paquete | Versión | Uso |
| --- | --- | --- |
| `express` | ^5.1.0 | Servidor HTTP |
| `postgres` | ^3.4.7 | Cliente PostgreSQL |
| `zod` | ^4.1.12 | Validación de entradas |
| `dotenv` | ^16.6.1 | Variables de entorno |
| `esbuild` | ^0.28.2 (dev) | Build de la interfaz |
