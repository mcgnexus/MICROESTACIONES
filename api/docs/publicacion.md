# Publicación y recuperación

Guía operativa para poner en producción una versión ya verificada y para volver atrás si algo falla. No sustituye a la revisión de la propia plataforma de alojamiento ni a las copias de seguridad de la base.

## Estado de esta versión de revisión

- Rama de revisión: `main` con los cambios de las fases 10 a 13 sin confirmar (working tree). No se ha desplegado producción.
- Entorno de prueba: servidor local (`node src/server.js`) sobre la base Neon configurada, con `EMAIL_PROVIDER=console`, `OTP_DEBUG=true` y `COOKIE_SECURE=false`. Sin campañas ni comunicaciones a personas reales.
- Evidencias de la verificación completa:
  - `npm run acceptance:phase13` → **42/42** comprobaciones (los 12 recorridos de la fase).
  - `npm run acceptance` → **59/59** comprobaciones (regresión de la primera fase).
  - `npm test` → **228/228** pruebas.
- Incidencia detectada y corregida durante la verificación: `GET /api/v1/public/stations` fallaba con `missing FROM-clause entry for table "c"` porque la consulta usaba `c.config` sin unir `device_configs`. Se añadió `LEFT JOIN device_configs c ON c.device_id = d.id`. Sin este arreglo, la portada pública no devolvía lecturas.
- Expectativas de prueba desactualizadas alineadas con el comportamiento real: la cancelación por baja incluye los envíos `manual` (`consent.test.js`) y la lectura de reglas usa `client.begin(...)` con la transacción recibida (`pipeline.test.js`).

## Requisitos previos

- Acceso a la consola de Neon con permiso para crear ramas o restaurar.
- Variable `DATABASE_URL` apuntando al entorno objetivo.
- Variables de entorno revisadas (ver `.env.example`): `PUBLIC_SITE_URL`, `ANALYTICS_CAMPAIGNS`, `COOKIE_SECURE`, `WHATSAPP_PROVIDER`, `EMAIL_PROVIDER`, `ALERT_ENGINE_VERIFIED`, `CRON_SECRET` (si se usa cron externo).

## Migración

Las migraciones son **aditivas e idempotentes**: `schema.sql` se ejecuta con `CREATE TABLE IF NOT EXISTS` y `migrate.js` aplica `ALTER ... IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS`. Se pueden ejecutar varias veces sin duplicar objetos. No hay migraciones destructivas ni reescritura de datos.

```sh
cd api
npm run migrate
```

Verificación posterior a la migración:

```sql
SELECT to_regclass('public.prospect_tracking') AS prospect_tracking,
       to_regclass('public.metric_daily') AS metric_daily,
       to_regclass('public.metric_milestones') AS metric_milestones;
```

Las tres columnas deben devolver el nombre de la tabla. Si alguna es `NULL`, revisar el error de `npm run migrate`.

Nota: `migrate.js` divide `schema.sql` por `;`. No introducir `;` dentro de comentarios ni literales en ese archivo, o la ejecución se detendrá con `syntax error at end of input`.

## Copia de seguridad

Antes de migrar o desplegar, tomar una copia recuperable:

- **Neon (recomendado)**: crear una rama (*branch*) de la base de producción en el momento previo al despliegue. Neon conserva el historial de punto en el tiempo (PITR) según el plan; la rama actúa como copia congelada y se puede promover si hace falta.
- **Copia lógica** (respaldo adicional, especialmente si no hay PITR):

```sh
pg_dump "$DATABASE_URL" --format=custom --file=backup-tecrural-$(date +%Y%m%d%H%M).dump
```

- Restauración de esa copia en una base vacía:

```sh
pg_restore --dbname "$DATABASE_URL_RESTORE" --clean --if-exists backup-tecrural-YYYYMMDDHHMM.dump
```

Confirmar el tamaño de la copia y que contiene las tablas principales (`subscribers`, `devices`, `measurements`, `farm_leads`) antes de continuar.

## Publicación

1. Crear la copia de seguridad (apartado anterior).
2. Desplegar la versión de revisión en un entorno de preproducción y comprobar:
   - `GET /health` responde `{"status":"ok"}`.
   - La portada y `/api/v1/public/stations` devuelven lecturas.
   - El acceso por enlace funciona y aísla las estaciones privadas.
3. Ejecutar `npm run migrate` contra la base de producción (o hacer que el despliegue lo ejecute antes de arrancar).
4. Desplegar la aplicación.
5. No activar cron de entrega hasta validar `GET /api/v1/admin/maintenance/limits`.

## Comprobaciones posteriores al despliegue

- `GET /health` → `ok`.
- `GET /api/v1/public/stations` → estaciones públicas con lecturas y frescura.
- Login de administración y `GET /api/v1/admin/analytics?from=...&to=...` → 200 con los ocho eventos (aunque sean cero).
- `GET /api/v1/admin/maintenance/limits` → frecuencias y caducidades vigentes, sin secretos.
- Enviar una medición de prueba con un token de estación de prueba y confirmar `ack_through` y que no se dispara ningún aviso si el valor es inválido.
- Revisar el log en busca de errores de scheduler o de proveedores.
- Confirmar que `service-worker.js` sirve la versión nueva (la caché usa `tecrural-shell-v3`).

## Reversión

La aplicación y el esquema están versionados por separado y los cambios de esquema son compatibles hacia atrás (solo tablas y columnas nuevas), por lo que **la reversión normal es volver a desplegar la versión anterior de la aplicación**: las tablas nuevas quedan sin usar y no rompen el código antiguo.

1. Redeploy de la versión anterior (rollback de la plataforma o del artefacto).
2. Si el fallo viniera de datos corruptos, restaurar la copia:
   - Promover la rama de Neon o `pg_restore` desde el `.dump`.
3. Solo si se necesita eliminar por completo los objetos nuevos (con pérdida de los datos de esas tablas):

```sql
DROP TABLE IF EXISTS metric_milestones;
DROP TABLE IF EXISTS metric_daily;
DROP TABLE IF EXISTS prospect_tracking;
```

Las columnas de `farm_leads` y `subscribers` usadas por la bandeja ya existían antes; no hace falta tocarlas. No borrar tablas sin copia reciente.

## Pendientes para producción

- Identificación fiscal completa del titular, domicilio y datos contractuales de proveedores/transferencias en las páginas legales.
- Revisión visual en un dispositivo móvil real y en instalación PWA.
- Decidir y documentar el catálogo `ANALYTICS_CAMPAIGNS` definitivo (nombres genéricos, sin datos personales).
- Confirmar el plan de Neon/temporizadores (cron diario de Vercel frente a cron externo con `CRON_SECRET`).
