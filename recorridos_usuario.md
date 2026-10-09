# Recorridos de usuario — TecRural Microestación

Fecha: 2026-10-09
Estado: propuesta para el piloto
Principio: diseñar recorridos antes que pantallas. Ninguna acción termina en promesa falsa, pantalla vacía ni permiso no explicado.

## Reglas transversales

- No se exige perfil completo para acceder al histórico gratuito.
- No se exige geolocalización, permiso de notificaciones ni publicidad para registrarse.
- La selección inicial de ubicación es manual; la geolocalización solo se añade si aporta utilidad demostrada.
- Registrar una cuenta **no** equivale a pedir una instalación.
- Instalar la PWA **no** identifica al visitante ni crea contacto comercial.
- Tras verificar el correo, el usuario vuelve a la función que había solicitado (`safeReturnPath`).

---

## Recorrido 1 — Visitante sin cuenta

**Entrada:** abre un enlace o escanea un QR (portada pública, sin sesión).

| Paso | Acción del usuario | Respuesta del sistema |
| --- | --- | --- |
| 1 | Abre la portada | Se cargan las estaciones públicas (`GET /api/v1/public/stations`) |
| 2 | Mira el tiempo local | Tarjeta del punto urbano: temperatura, humedad, hora del dato y estado (reciente/antiguo/sin conexión) |
| 3 | Quiere saber dónde se mide | Texto explícito: «un emplazamiento concreto, no toda la ciudad»; zona, altitud y estación |
| 4 | Consulta la evolución | Gráfica de 24 h del punto público |
| 5 | Compara con AEMET | Última comparación válida emparejada (±10 min), con proximidad y fuente |
| 6 | Entiende el servicio | Sección de explicación y CTA de acceso gratuito |

**Errores y estados:**
- Sin medición urbana pública: tarjeta que explica que no se sustituye por finca ni previsión.
- Dato antiguo: se etiqueta como «última medición», nunca como actual.
- AEMET no disponible: la comparación muestra «no disponible»; el dato local sigue visible.

**Siguiente paso:** registrarse para histórico de 7 días o solicitar instalación.

---

## Recorrido 2 — Registro (cuenta gratuita)

**Entrada:** solicita acceso con su correo desde la herramienta que estaba usando.

| Paso | Acción del usuario | Respuesta del sistema |
| --- | --- | --- |
| 1 | Escribe su correo y pulsa «solicitar acceso» | `POST /api/auth/magic/request` con `next` = herramienta solicitada |
| 2 | (Opcional) marca novedades | Consentimiento comercial separado, sin marcar por defecto |
| 3 | Recibe el correo | Enlace de un solo uso, caduca en 15 min, avisa de que es comunicación necesaria |
| 4 | Pulsa el enlace | `POST /api/auth/magic/verify`; se consume el token y se abre sesión `viewer`/`free` |
| 5 | Vuelve a su función | Redirige al `next` solicitado (p. ej. `#/evolucion`), no a una pantalla genérica |
| 6 | Entra al histórico ampliado | Ve 7 días en lugar de 24 h |
| 7 | Vuelve más tarde | Repite el enlace y recupera su sesión y favoritos |

**Errores y estados:**
- Correo sin canal de entrega: `503 email_delivery_unavailable`; se ofrece atención manual.
- Enlace caducado o ya usado: «enlace no válido o caducado»; puede pedir otro.
- Cuenta privilegiada (admin/operator): se indica que debe usar contraseña.
- Solicitud duplicada: respuesta genérica `202 sent` para no revelar si la cuenta existe.

**Siguiente paso:** consultar histórico, marcar favoritos o solicitar instalación (acción distinta).

---

## Recorrido 3 — Solicitud comercial

**Entrada:** pulsa «solicitar piloto / estación» en la web.

| Paso | Acción del usuario | Respuesta del sistema |
| --- | --- | --- |
| 1 | Indica nombre y teléfono (obligatorios) | Validación `leadSchema`; teléfono normalizado |
| 2 | Indica localidad y tipo (finca o casa de campo) | `activity`, `zone` opcionales |
| 3 | (Opcional) elige el problema que le interesa | `interest`: heladas, calor, tormentas, viento, humedad, general, futura_instalacion |
| 4 | (Opcional) correo y notas | Solo si los rellena |
| 5 | Marca consentimiento de servicio (obligatorio) | `consent` debe ser `true`; se registra con fecha y versión |
| 6 | (Opcional) marca novedades | Consentimiento comercial separado |
| 7 | Envía | `POST /api/v1/leads`; se guarda y se registran los consentimientos |
| 8 | Recibe confirmación | «Solicitud recibida. Te contactaremos.» |

**Errores y estados:**
- Campo trampa relleno (bot): responde `201 received` sin guardar.
- Límite por IP/teléfono: `429 too_many_requests`.
- Duplicado en 24 h: no se crea otra fila, misma confirmación.
- Falta el consentimiento: `400 invalid_body`.

**Siguiente paso:** el equipo revisa y contacta; la solicitud queda en estado `nuevo`.

---

## Recorrido 4 — Cliente (servicio en finca o casa de campo)

**Entrada:** accede con enlace o contraseña; su cuenta tiene una estación asignada.

| Paso | Acción del usuario | Respuesta del sistema |
| --- | --- | --- |
| 1 | Entra | Sesión con ámbito limitado a sus estaciones (`accessibleDeviceIds`) |
| 2 | Ve su emplazamiento | Panel con la estación asignada y su nombre de finca |
| 3 | Ve el estado | Conectividad, última lectura válida, batería y frescura del dato |
| 4 | Revisa histórico | Hasta 90 días de su emplazamiento |
| 5 | Revisa avisos | Avisos locales de su estación, con antigüedad de la medida |
| 6 | Configura contacto | Canales de aviso (WhatsApp/correo) con verificación por código |
| 7 | Sabe cómo contactar | Datos de soporte de TecRural visibles en cuenta y página de contacto |

**Errores y estados:**
- Sin datos todavía: se explica que la estación aún no ha enviado o está en instalación.
- Motor de avisos no verificado en esa instalación: `engine_verified=false`; no se prometen avisos no probados.
- Estación sin conexión: se muestra «sin conexión» con la última lectura conocida.

**Siguiente paso:** mantenimiento, retirada al finalizar o contacto con TecRural.

---

## Separación de acciones (textos, modelo y métricas)

| Acción | Qué significa | Qué NO significa |
| --- | --- | --- |
| Registrar cuenta | Identidad para acceder al histórico gratuito | No es solicitar instalación |
| Instalar la PWA | Acceso cómodo desde el dispositivo | No identifica al visitante ni crea contacto comercial |
| Solicitar estación | Solicitud comercial en `farm_leads` | No crea cuenta ni asigna estación automáticamente |
| Aceptar novedades | Consentimiento comercial (`consent_records`) | No condiciona el acceso ni el servicio |

Métricas separadas: `access_requested`, `contact_verified`, `commercial_authorized`, `installation_interest`, `agricultural_profile_completed`.

---

## Validación

| Criterio | Cómo se comprueba |
| --- | --- |
| Ninguna acción acaba en promesa falsa | Textos distinguen dato local, previsión y aviso; estados de error explícitos |
| Ninguna pantalla vacía | Cada estado sin datos tiene mensaje («sin lectura registrada», «sin conexión», «no configurada») |
| Ningún permiso no explicado | No se piden geolocalización ni notificaciones para registrarse |
| Verificar el correo devuelve a la función pedida | `safeReturnPath` conserva `next` y redirige a la herramienta solicitada |
