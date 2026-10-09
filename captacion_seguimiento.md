# Captación de solicitudes y seguimiento comercial

Fecha: 2026-10-09
Base: `farm_leads` (solicitud), `subscribers` (cuenta), `prospect_tracking` (seguimiento), `consent_records`, `analytics.js`.

## 1. Dos registros distintos

| Registro | Tabla | Qué es |
| --- | --- | --- |
| Cuenta registrada | `subscribers` | Identidad para acceder |
| Solicitud de servicio | `farm_leads` | Petición comercial |

- Pueden **vincularse** cuando corresponda (mismo contacto), sin confundirlos ni duplicar contactos innecesariamente.
- La vinculación se hace por contacto verificado, no por coincidencia de nombre.

## 2. Formulario comercial (breve)

| Campo | Obligatorio |
| --- | --- |
| Nombre | Sí |
| Teléfono | Sí |
| Localidad | Sí |
| Finca o casa de campo | Opcional |
| Necesidad principal | Opcional |
| Correo | Solo si aporta utilidad concreta |
| Consentimiento de servicio | Sí (literal `true`) |
| Autorización de promociones | Opcional, sin marcar por defecto |

- Presentar información de privacidad.
- Separar la petición de respuesta de la autorización opcional para promociones.

## 3. Confirmación

La confirmación significa **«solicitud guardada»**. No significa:
- instalación programada;
- servicio activado;
- mensaje enviado.

- La solicitud se **persiste antes** de confirmar.
- Una notificación interna fallida **no** la pierde: permanece visible en administración.
- Campo trampa (`website`) descarta bots sin delatarlo.
- Reintento del mismo envío: dedupe por teléfono/nombre/email/interés en 24 h.

## 4. Bandeja de administración

Etapas implementadas (`farm_leads.status`):

| Etapa | Descripción |
| --- | --- |
| `nuevo` | Sin contactar |
| `contactado` | Primer contacto hecho |
| `interesado` | Necesidad y encaje confirmados |
| `piloto_activo` | Piloto en marcha |
| `cliente` | Servicio activo |
| `descartado` | Cerrada con motivo |

El seguimiento fino (próxima acción, fecha, notas) vive en `prospect_tracking`, sin cambiar la etapa del lead.

Cada solicitud incluye:
- Origen.
- Próxima acción.
- Fecha de seguimiento.
- Responsable.
- Motivo de cierre.

TecRural puede registrar llamadas y visitas **manualmente**. No se programan campañas automáticas en el lanzamiento.

## 5. Referencias de captación permitidas

- Guardar solo referencias permitidas: canal, campaña, QR (`source`, `medium`, `campaign`, `content`, `term`, `ref`).
- Longitud y catálogo limitados (`campaignSchema`, `normalizeAcquisition`).
- **No** almacenar URLs completas, texto libre innecesario ni contactos en parámetros de analítica.

## 6. Reglas para unir solicitudes con cuentas

| Situación | Regla |
| --- | --- |
| Mismo correo verificado | Se vincula la solicitud a la cuenta |
| Cuenta creada después | Se enlaza al verificar el correo |
| Contacto sin cuenta | La solicitud vive en `farm_leads` |
| Exportación comercial | Solo con consentimiento y sin duplicar dirección |

## 7. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Reintento del mismo envío | No crea ráfaga de solicitudes |
| Error de red | No muestra éxito |
| Aviso interno fallido | La solicitud llega a administración igualmente |
| Rechazar promociones | No impide solicitar ni usar el servicio |
