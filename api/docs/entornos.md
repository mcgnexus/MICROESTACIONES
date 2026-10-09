# Entornos de desarrollo, pruebas y producción

Guía operativa de la Entrega A. No sustituye a la revisión de la plataforma ni a las copias de Neon.

## Objetivo

Poder probar sin afectar a producción. La migración y la retención escriben en la base; las pruebas unitarias no.

## Qué toca cada cosa

| Comando | Toca la base | Riesgo |
| --- | --- | --- |
| `npm test` (44 ficheros) | **No** | Ninguno: ningún test importa `db.js` |
| `npm run migrate` | Sí (esquema) | Aditivo e idempotente |
| `npm run retention` | Sí (borra) | **Alto** |
| `npm run create-user` / `provision-device` | Sí (crea) | Medio |
| `npm run acceptance` / `acceptance:phase13` | Sí (crea y borra `acp-*`) | Alto si apunta a producción |
| `npm run env:check` | **No** | Ninguno |

## Comprobar el entorno antes de tocar nada

```sh
cd api
npm run env:check
```

Muestra `NODE_ENV`, `VERCEL_ENV`, host, base de datos y `sslmode`, sin imprimir usuario ni contraseña. Clasifica como «producción» si `NODE_ENV`/`VERCEL_ENV` es `production` o si el host está en `PRODUCTION_DB_HOSTS` (lista separada por comas).

## Copia y restauración

```sh
npm run db:backup
# genera backups/backup-tecrural-YYYYMMDDHHMM.dump (carpeta ignorada por git)

npm run db:restore -- --in backups\backup-tecrural-YYYYMMDDHHMM.dump --target "postgresql://..."
```

- Requieren `pg_dump` / `pg_restore` en el PATH (herramientas cliente de PostgreSQL).
- La restauración **rechaza** el mismo host que `DATABASE_URL` y nunca usa producción como destino por defecto.
- Alternativa en Neon: crear una **rama** de la base como copia congelada.

## Guardián de producción

`migrate.js` y `retention-cli.js` se detienen si detectan producción:

- `NODE_ENV` o `VERCEL_ENV` = `production`, o
- el host de `DATABASE_URL` está en `PRODUCTION_DB_HOSTS`.

Para forzar una operación intencionada sobre producción:

```sh
npm run migrate -- --force
# o
ALLOW_PRODUCTION_WRITES=true npm run migrate
```

Hazlo solo tras una copia restaurable. Añade el host real a `PRODUCTION_DB_HOSTS`
en tu `.env` local (no se versiona), por ejemplo la variante pooled y directa de Neon.

## Reglas de separación

1. Desarrollo y pruebas usan una base **distinta** de producción (rama de Neon o PostgreSQL local).
2. Los despliegues de prueba no usan contactos reales ni envían mensajes a clientes.
3. `EMAIL_PROVIDER=console` y `OTP_DEBUG=true` solo fuera de producción.
4. Las credenciales no se incorporan al repositorio, al navegador ni a los registros.
5. Antes de migrar producción: copia restaurable y prueba de restauración en entorno aislado.
