# Seguridad, privacidad y retención desde los contratos

Fecha: 2026-10-09
Base: `security.js`, `auth.js`, `env.js`, `consent.js`, `retention.js`, cabeceras en `server.js`/`vercel.json`.

## 1. Credenciales

| Regla | Detalle |
| --- | --- |
| Separación por entorno y uso | Credenciales distintas por entorno |
| Identidad operativa | La app **no** usa el propietario de la base |
| Privilegios | Migración aparte; la app con los mínimos |
| Estación | Cada estación con su **propia** credencial revocable (`device_credentials`) |
| Secretos | En servidor o dispositivo; fuera de exportaciones, analítica y registros |

## 2. Seguridad de aplicación

- HTTPS y cabeceras: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, CSP ajustada a integraciones reales.
- Protección de formularios (CSRF `X-Requested-With`), límites de intentos (`login-rate-limit`), validación de entradas (Zod).
- Revisar especialmente: cambios de estación, publicación, permisos y reglas de avisos.
- Registrar acciones administrativas (`audit_logs`) sin copiar datos sensibles innecesarios.

## 3. Privacidad

- Definir responsable del tratamiento, finalidades y bases jurídicas con **revisión profesional**.
- Prestación del servicio y marketing son finalidades **distintas**; no resolver todo con una casilla genérica.
- Promociones con autorización **separada** cuando corresponda y baja efectiva (`consent_records`).
- Informar de proveedores, encargados, regiones y transferencias aplicables.

## 4. Cookies

- Cookies de sesión y recursos estrictamente necesarios documentados según su función.
- Antes de incorporar analítica o seguimiento, determinar si requieren consentimiento; no asumir que lo agregado está exento.
- Si se necesita consentimiento: rechazar tan fácil como aceptar; la negativa **no** bloquea el servicio.
- Referencia: Guía de cookies de la AEPD.

## 5. Textos legales

- Completar identidad legal, contacto y condiciones aplicables a solicitudes y contratación.
- Verificar información del prestador y comunicaciones comerciales.
- La revisión de textos legales y fiscalidad corresponde a un **profesional** antes de vender.
- Referencia: LSSI (BOE).

## 6. Retención

Plazos por finalidad **antes** de automatizar borrados. Propuesta operativa revisable:

| Dato | Plazo propuesto |
| --- | --- |
| Mediciones normalizadas | 24 meses (ciclos estacionales) |
| Histórico existente | **No** se borra durante la migración |
| Respuestas originales | Plazo aparte |
| Intentos de acceso | Plazo aparte |
| Solicitudes sin seguimiento | Plazo aparte |
| Registros de entrega | Plazo aparte |
| Datos personales / obligaciones | Política específica |

- Los límites visibles de cada plan **no** determinan su borrado.

## 7. Baja y supresión

- Alcanza sesiones, contactos y envíos pendientes según la política aplicable.
- Los datos conservados por obligación se restringen y **no** se reutilizan para promoción.
- Documentar tratamiento de copias de seguridad.
- Impedir que una **restauración** reactive bajas o permisos revocados.

## 8. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Secretos | No aparecen en archivos públicos ni registros |
| Baja | Cancela promociones pendientes |
| Exportación | Requiere autorización |
| Cambio de usuario | Limpia estado privado |
| Restauración | No reactiva comunicaciones revocadas |
