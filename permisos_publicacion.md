# Permisos por rol, recurso y modalidad — TecRural Microestación

Fecha: 2026-10-09
Principio: el plan comercial **no** sustituye a la asignación de estación. Los permisos se comprueban en el servidor en cada operación, consulta, exportación y enlace directo.

## 1. Matriz de permisos

| Recurso / operación | Visitante | Registrado gratuito | Cliente servicio activo | Operador | Administrador | Dispositivo |
| --- | --- | --- | --- | --- | --- | --- |
| Datos públicos (ventana limitada) | Sí | Sí (ampliada) | Sí | Sí | Sí | No |
| Su propia cuenta | No | Sí | Sí | Sí | Sí | No |
| Estaciones asignadas | No | Solo demostración | Solo las suyas | Solo asignadas | Todas | No |
| Histórico | 24 h público | 7 d público | 90 d asignado | Según ámbito | Todos | No |
| Avisos | No | No (salvo concedidos) | Solo sus estaciones | Reglas/avisos asignados | Todos | No |
| Configuración de estación | No | No | No | Sí (asignadas) | Sí | Solo la suya (lectura) |
| Crear/editar estación | No | No | No | Sí | Sí | No |
| Eliminar estación | No | No | No | No | Sí | No |
| Exportar CSV | No | No | Sí (sus datos) | Sí (ámbito) | Sí | No |
| Solicitudes y ofertas | Crear | Crear | Crear | Ver | Gestionar | No |
| Usuarios y roles | No | No | No | No | Sí | No |
| Enviar mediciones | No | No | No | No | No | Solo las propias |

## 2. Reglas por rol

### Visitante (sin sesión)
- Lectura de `/api/v1/public/*` y portada.
- Ventana limitada (24 h de evolución pública).
- Sin coordenadas exactas ni contactos.

### Registrado gratuito (`viewer`)
- Acceso público ampliado (7 días).
- Gestión de su cuenta, contactos, fincas y consentimientos.
- Ámbito de datos: `subscriber_devices` **∪** estaciones con `publish_permission`.
- Ámbito de avisos: **solo** `subscriber_devices` (ver la demostración no suscribe a sus avisos).

### Cliente con servicio activo
- Acceso a estaciones **expresamente asignadas** (`station_access`) y funciones contratadas.
- No obtiene acceso a todas las fincas aunque pague.
- Su plan (`pro`/`enterprise`) no amplía el ámbito por sí solo.

### Operador TecRural
- Operación de estaciones y mantenimiento dentro de su ámbito (`subscriber_devices`).
- Reglas, avisos, configuración, validación de mediciones.
- No gestiona usuarios ni elimina estaciones.

### Administrador
- Gestión de usuarios, acceso, ofertas, solicitudes y configuración.
- Ámbito global (`null` = todas).
- Único que elimina estaciones y cierra avisos heredados.

### Dispositivo
- `requireDevice`: token de estación (hash en `device_credentials`).
- Envía sus propias mediciones (identidad verificada: `device_id` del token).
- Consulta **solo** su configuración (`/api/config`).
- No accede a otras estaciones ni a la web.

## 3. Comprobación en servidor

| Punto | Mecanismo |
| --- | --- |
| Sesión | `requireSubscriber` valida `tr_session` (hash, caducidad, `active`) |
| Rol | `requireRole('operator'\|'admin')` |
| Ámbito de datos | `accessibleDeviceIds` en cada consulta y exportación |
| Ámbito de avisos | `alertableDeviceIds` |
| Recurso concreto | `requireStationAccess`: 404 si no está en el ámbito (no filtra existencia) |
| CSRF | `csrfGuard` exige `X-Requested-With: fetch` en mutaciones |
| Dispositivo | `requireDevice` + verificación de `device_id` contra el token |

La comprobación se aplica **también** en enlaces directos (`/api/v1/measurements/:id`), exportaciones (`/api/v1/measurements.csv`) y estadísticas por estación.

## 4. Efecto de suspensión y baja

| Estado | Efecto |
| --- | --- |
| Suspensión | El servicio privado deja de estar disponible según condiciones; el acceso gratuito se conserva |
| Baja | Se revoca `station_access` y se cierra `services.ended_at`; el usuario mantiene cuenta y derechos |
| Derechos | Puede ejercer acceso, rectificación, supresión y portabilidad sobre su cuenta |
| Publicación | **No** se publica la estación automáticamente al cancelar |

## 5. Política de publicación

- La publicación de una estación privada requiere **decisión expresa y granular** (`publish_permission`).
- Las coordenadas exactas, nombres personales y contactos **no** salen por las API públicas.
- El punto urbano público puede mostrar una **ubicación aproximada autorizada** (zona/altitud), sin fingir que unas coordenadas genéricas del municipio son la posición real del sensor.
- Revocar `publish_permission` retira la estación de las API públicas de inmediato.

## 6. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Dos clientes distintos | Cada uno solo ve sus estaciones; alterar `device_id` en URL da 404 |
| Cuenta gratuita | Solo ve demostración + concesiones; no accede a fincas privadas |
| Operador | Opera solo estaciones de su ámbito; no gestiona usuarios |
| Administrador | Acceso global; única vía de borrado |
| Dispositivo | Envía solo con su token; no lee otras estaciones |
| Alterar `:id`, filtros, CSV o enlaces directos | No permite acceder a recursos ajenos |
