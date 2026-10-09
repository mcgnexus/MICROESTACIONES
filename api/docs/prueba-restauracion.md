# Prueba de copia y restauración — 2026-10-09

## Resultado

Se ejecutaron los scripts existentes `db:backup` y `db:restore` con las
herramientas portátiles oficiales de PostgreSQL 17.6. La copia leyó producción;
la restauración escribió exclusivamente en una base vacía de una rama aislada.

- Archivo local, ignorado por Git: `api/backups/restore-drill.dump`.
- Tamaño: 320.493 bytes, formato custom de PostgreSQL.
- Rama de destino: `prueba-restauracion` (`br-dark-star-aldlmiq4`).
- Base de destino: `tecrural_restore_drill`.
- Duración de restauración: aproximadamente 67 segundos.
- `pg_restore` terminó sin errores.
- Se recuperaron las mismas 46 tablas públicas que existen en producción.

## Comprobaciones posteriores

| Tabla | Restauración | Producción al comprobar |
| --- | ---: | ---: |
| devices | 1 | 1 |
| subscribers | 1 | 1 |
| measurements | 1.298 | 1.298 |
| farm_leads | 0 | 0 |
| installations | 1 | 1 |
| services | 0 | 0 |
| audit_logs | 61 | 61 |

No se encontraron mediciones sin estación asociada. La ficha de
`esp32c3-01` conserva el estado de verificación `verified`.

Esta evidencia acredita restauración del esquema y los recuentos indicados;
no sustituye una prueba de navegación y acceso contra la base restaurada.
Producción recibe nuevas mediciones, por lo que sus recuentos posteriores
pueden superar los de esta copia.

## Entorno y conservación

Las herramientas están en el directorio temporal de OpenCode y no se han
añadido al PATH permanente. Para repetir la prueba en otra sesión hay que
disponer nuevamente de `pg_dump` y `pg_restore` en el PATH.

La rama de restauración y la copia local se conservan para revisión. Contienen
una copia de los datos reales: no publicar el archivo ni sus credenciales.
No hay servidor de aplicación ni planificador iniciado contra este destino.
