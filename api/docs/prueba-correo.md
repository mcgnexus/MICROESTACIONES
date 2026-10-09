# Prueba de correo real — 2026-10-09

## Configuración y resultado

- Dominio `tecrural.es` verificado en Resend (DKIM y registros de envío).
- Vercel producción configurado con `EMAIL_PROVIDER=resend`,
  `EMAIL_FROM=TecRural <avisos@tecrural.es>` y clave almacenada como secreto.
- Redespliegue completado; `/api/v1/public-config` devuelve
  `emailDelivery=resend` y `emailAvailable=true`.
- Enviado un mensaje de diagnóstico mediante la API de Resend a la dirección
  indicada por el usuario, correspondiente a su cuenta administradora.
- Resend informó `delivered` y el usuario confirmó que recibió el mensaje.
- No se activaron consentimientos comerciales.

## Alcance y pendiente

Esta prueba confirma la entrega real desde el remitente configurado y su
recepción por el usuario. El mensaje de diagnóstico se envió directamente
mediante Resend, no a través del flujo de acceso de la aplicación.

La solicitud de enlace mágico para la cuenta administradora respondió de forma
genérica con HTTP 202, pero no emitió un enlace: el diseño exige contraseña
para cuentas `admin` y `operator`.

## Prueba del enlace mágico en producción

Se solicitó un enlace para otra dirección facilitada por el usuario, sin
activar comunicaciones comerciales. La aplicación respondió HTTP 202 con
`status=sent`. El usuario confirmó que la recepción, la confirmación del
enlace y el acceso al panel funcionaron correctamente.

Las consultas posteriores al estado de entrega en Resend agotaron el tiempo
de conexión; para esta prueba la evidencia de recepción y acceso es la
confirmación del usuario.

No se comprobó manualmente la reutilización del enlace ni su caducidad en
producción. El usuario indicó posteriormente que realizó la prueba en Android;
no especificó el navegador.

## Incidencia posterior y corrección del frontend

El usuario indicó después que probaba en Android y que, al abrir el enlace,
volvía a la pantalla de entrada con correo. La normalización de `/entrar` a
la ruta interna eliminaba la consulta antes de que `handleMagicReturn` leyera
el token. Esta incidencia obligó a repetir la prueba tras corregir el frontend.

Se corrigió la conservación de la consulta hasta capturar y retirar el token.
La pantalla de confirmación ahora se titula «Confirma tu acceso» y explica que
no es necesario volver a escribir el correo. Los errores permanecen visibles
aunque el formulario de solicitud esté oculto.

- Tres pruebas de regresión ejecutan el arranque de navegación con y sin token.
- Suite: 318/318; build completado.
- Corrección desplegada en producción; bundle remoto idéntico al local.
- Se solicitó un nuevo enlace para repetir la prueba (HTTP 202).
- El usuario confirmó después del despliegue que el recorrido corregido funciona.
