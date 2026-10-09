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
| `npm run acceptance` / `acceptance:phase13` | Sí (crea y borra `acp-*` / `ph13-*`) | Alto si apunta a producción |
| `npm run env:check` | **No** | Ninguno |
| `npm run launch:check` | **No** (solo lectura) | Ninguno |
| `npm run aemet:check` | **No** (solo lectura) | Ninguno |

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

## Base de pruebas (rama de Neon)

Las pruebas de aceptación e integración escriben y borran datos. Se ejecutan contra una
base **distinta** de producción:

1. En la consola de Neon, crear una **rama** (branch) a partir de la base principal.
   Copiar su cadena de conexión (con `sslmode=require`).
2. Añadirla al `.env` local como `DATABASE_URL_TEST` (no se versiona).
3. Añadir el host de producción a `PRODUCTION_DB_HOSTS` para activar el guardián.
4. Ejecutar:

```sh
cd api
npm run migrate                      # aplica el esquema a la base de producción/pruebas activa
npm run acceptance                   # usa DATABASE_URL_TEST automáticamente
npm run acceptance:phase13
```

- `acceptance.mjs` y `acceptance-phase13.mjs` usan `DATABASE_URL_TEST` si existe y **se
  niegan a ejecutarse** contra un destino clasificado como producción (salvo `--force`).
- El servidor que levantan hereda `DATABASE_URL` de la base de pruebas.
- Aplicar el esquema a la rama: `DATABASE_URL="$DATABASE_URL_TEST" npm run migrate` (o
  cambiar temporalmente `DATABASE_URL`).

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

## Verificación de lanzamiento

```sh
cd api
npm run launch:check
```

Solo lectura. Comprueba configuración de entorno (dominio, canales, planificador, avisos) y estado de la base (estaciones, mediciones, cola, instalaciones, duplicados). Sale con código 1 si hay algún FALLO. Los puntos manuales (identidad legal, precios, pruebas en móvil) no los cubre.

## Reglas de separación

1. Desarrollo y pruebas usan una base **distinta** de producción (rama de Neon o PostgreSQL local).
2. Los despliegues de prueba no usan contactos reales ni envían mensajes a clientes.
3. `EMAIL_PROVIDER=console` y `OTP_DEBUG=true` solo fuera de producción.
4. Las credenciales no se incorporan al repositorio, al navegador ni a los registros.
5. Antes de migrar producción: copia restaurable y prueba de restauración en entorno aislado.
