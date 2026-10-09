# Cola, prioridad, reintento y programador

Fecha: 2026-10-09
Base: `notification_outbox`, `notify.js` (`dispatchOutbox`), `scheduler.js`.

## 1. Cola persistente en PostgreSQL

- Volumen inicial: cola persistente en PostgreSQL con **estados e intentos**.
- El trabajo se registra **dentro de la misma operación consistente** que crea la acción que lo origina.
- Un proceso independiente selecciona pendientes, los **reserva** con bloqueo/arrendamiento recuperable y ejecuta entregas con límites de tiempo.

## 2. Estados

| Estado | Significado |
| --- | --- |
| `pending` | Pendiente |
| `sending` | En proceso (reclamado) |
| `sent` | Aceptado por el proveedor |
| `delivered` | Confirmado por el proveedor (cuando lo permita) |
| `failed` | Fallido |
| `expired` | Caducado |
| `cancelled` | Cancelado |
| `manual` | Requiere revisión/envío manual |

- Verificar **firmas** de confirmaciones externas (`webhooks.js`).
- Reintentos **progresivos**: 30 s, 60 s, 120 s… hasta 1 h (máx. 5 intentos).
- Caducidad por tipo (`message-ttl.js`).
- Revalidar **permiso, destinatario y vigencia** justo antes de enviar.

## 3. Idempotencia y riesgo residual

- Las garantías externas no son absolutas: ante un timeout puede no saberse si el proveedor aceptó.
- Usar **claves idempotentes** cuando existan.
- Documentar el riesgo residual de duplicado; **no** prometer entrega exactamente una vez.
- En la base, impedir duplicados del mismo episodio y destinatario (`dedupe_key`, índice comercial).

## 4. Prioridad

| Prioridad | Tipo |
| --- | --- |
| Alta | Accesos temporales y avisos vigentes |
| Baja | Tareas informativas/comerciales |

- El correo de acceso necesita un **intento inmediato** tras persistirlo y recuperación frecuente si falla; **no** espera a un proceso diario.
- **No** marcar un envío como realizado por el mero hecho de añadirlo a la cola.

## 5. Programador periódico

- Ejecutor independiente del tráfico.
- Frecuencia inicial: **1 minuto** para recuperar entregas y comprobar tareas vencidas.
- Cada tarea AEMET mantiene su **propia cadencia** (no consultar todas cada minuto).
- El sistema comprueba también conexión, retención y mantenimiento a sus frecuencias.

### Vercel

- Plan Hobby: uso personal **no comercial**; tareas programadas como máximo **diarias**.
- Continuidad para proyecto comercial: evaluar **Pro** con su coste total, o alojamiento que permita uso comercial y la ejecución requerida.
- **No** contratar automáticamente; confirmar presupuesto, condiciones y consumo.
- Mecanismo actual: n8n/cron externo con `CRON_SECRET` (`POST /api/v1/maintenance/scheduler`).

## 6. Seguridad operativa

- Proteger las tareas con credenciales de servidor (`CRON_SECRET`, comparación en tiempo constante).
- Controlar solapamientos (`inFlight`, `FOR UPDATE SKIP LOCKED`) y reejecuciones.
- Verificar que no quedan programaciones antiguas tras despliegue o reversión.
- **No** confiar en procesos en memoria ni en trabajo abandonado tras responder una función.

## 7. Monitorización

- Estado de la cola y antigüedad del trabajo accionable (`/api/v1/maintenance/status`).
- Detectar cola bloqueada.
- Medir objetivos de **recepción y entrega** en el canal elegido, no solo la respuesta de la API.

## 8. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Sin visitantes | Diez entregas de prueba avanzan |
| Proceso interrumpido | Libera trabajos para recuperación |
| Dos ejecutores | No envían el mismo trabajo a la vez |
| Código caducado | No se envía |
| Cola bloqueada | Se detecta |
| Objetivos | Medidos en recepción/entrega, no en la API |
