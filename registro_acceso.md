# Registro gratuito y acceso — recorrido, sesión y entrega

Fecha: 2026-10-09
Base: magic links (`magic-link.js`), sesiones (`web_sessions`), entrega (`email.js`).

## 1. Alta y acceso

- Entrada mediante **correo verificado y enlace temporal**, aprovechando la base existente.
- En el alta se pide **solo el correo**; nombre, localidad y actividad pueden completarse después.
- El acceso administrativo es **independiente**, con autenticación reforzada y segundo factor cuando esté disponible.
- El proveedor y remitente deben estar configurados y comprobados **antes** de mostrar la opción en producción.

### Recorrido

```
1. Solicitud                 → POST /api/auth/magic/request (con `next`)
2. Registro del intento      → magic_links (hash, caducidad, return_path)
3. Entrega al proveedor      → email.js
4. Recepción del enlace      → /entrar?token=…&next=…
5. Confirmación explícita    → POST /api/auth/magic/verify
6. Creación/recuperación     → resolvePasswordlessAccount (viewer/free)
7. Sesión                    → cookie HttpOnly
8. Retorno al histórico      → safeReturnPath(next)
```

## 2. Estados separados de la entrega

| Estado | Significado | No significa |
| --- | --- | --- |
| Solicitado | Intento registrado | Enviado |
| Enviado | Aceptado por el proveedor | Entregado |
| Entregado | Confirmado por webhook | Leído |
| Fallido | Error del proveedor | — |

- **No** crear un contacto comercial verificado por el mero envío del formulario.
- **No** identificar un correo aceptado por el proveedor como leído o entregado a una persona.
- Si el canal de acceso está globalmente desactivado: mostrar indisponibilidad y alternativa de contacto, sin fingir un envío (`503 email_delivery_unavailable`).

## 3. Política de enlaces

| Regla | Valor |
| --- | --- |
| Aleatoriedad | Token aleatorio (`randomToken`) |
| Uso | Un solo uso, consumo **atómico** (`consumed_at` NULL → now) |
| Almacenamiento | Solo **hash** (`token_hash`) |
| Caducidad | 15 min (`MAGIC_LINK_TTL_MINUTES`) |
| Reenvíos | Cooldown 60 s (`MAGIC_RESEND_COOLDOWN_SECONDS`) |
| Intentos | Máx. 5 (`MAGIC_REQUEST_MAX_ATTEMPTS`) |
| Anti-enumeración | Respuesta genérica `202 sent` |
| Ruta de retorno | Lista blanca de destinos internos (`RETURN_PATHS`) |

- La visita automática de un analizador de correo **no** consume el enlace: se exige confirmación explícita antes de iniciar sesión.
- La ruta de retorno debe pertenecer a la lista de destinos internos permitidos.

## 4. Material de la cola

- En las tablas de autenticación se conserva **solo el hash**.
- Si la cola necesita el enlace para repetir el envío, ese material se guarda **temporalmente cifrado**, con acceso restringido, vencimiento corto y eliminación al finalizar.
- **No** escribir el enlace completo ni el cuerpo del correo en registros.
- Así la entrega es recuperable sin convertir la cola en un archivo de credenciales reutilizables.

## 5. Política de sesión

| Aspecto | Regla |
| --- | --- |
| Almacenamiento | Cookie `HttpOnly`, `SameSite=Strict`, `Secure` en producción |
| JavaScript | Inaccesible (`HttpOnly`); **no** se guarda en `localStorage` |
| Caducidad | `SESSION_TTL_DAYS` (7 por defecto, 1–30) |
| Revocación | Borrado de la fila en `web_sessions` |
| Cierre | `POST /api/auth/logout` elimina la sesión y expira la cookie |
| CSRF | `csrfGuard` exige `X-Requested-With: fetch` en mutaciones |

Referencia: OWASP Session Management Cheat Sheet.

## 6. Procedimiento de recuperación

| Situación | Acción |
| --- | --- |
| Enlace no recibido | Reenviar tras el cooldown |
| Enlace caducado | Solicitar uno nuevo |
| Enlace ya usado | Solicitar uno nuevo (no se reutiliza) |
| Escáner consumió el enlace | Confirmación explícita evita el consumo automático |
| Envío fallido | Reintento con espera; nunca se finge entregado |
| Cuenta privilegiada | Debe usar contraseña (`password_login_required`) |
| Canal caído | Mostrar indisponibilidad y contacto manual |

## 7. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Mensaje real en cuenta de prueba | Se recibe, se abre, se confirma y se accede al histórico ampliado |
| Reutilización | El segundo intento falla (`link_invalid_or_expired`) |
| Caducidad | Fuera de 15 min no produce sesión |
| Enlace visitado por escáner | No inicia sesión sin confirmación |
| Envío fallido | Estado `failed`; reintento |
| Dos pestañas simultáneas | Una sola transición de consumo |
| Correo duplicado por formato | `email_normalized` lo unifica |
| Sesión revocada | `401 session_expired` |
