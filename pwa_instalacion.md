# PWA — instalación, caché, actualización y falta de conexión

Fecha: 2026-10-09
Base: `manifest.webmanifest`, `service-worker.js` (`tecrural-shell-v4`), `app.js`.

## 1. Preparación

| Elemento | Regla |
| --- | --- |
| Manifiesto | `manifest.webmanifest` con nombre, iconos (192/512), inicio y `display: standalone` |
| Navegación | Independiente (standalone) |
| Transporte | HTTPS obligatorio |
| Alcance | Mismo origen; `/api/` excluido del shell |

## 2. Instalación por plataforma

- Detectar capacidades del navegador (`beforeinstallprompt`, `navigator.standalone`).
- Mostrar instrucciones apropiadas para **Android, iPhone y escritorio**.
- Un botón de instalación solo aparece cuando puede ejecutar una **acción real**; en otros casos, instrucciones verificadas.
- Ofrecer instalar **después** de consultar datos o crear la cuenta; sin bloquear la visita.
- La instalación **no** es un permiso para comunicaciones comerciales.
- Razón comunicada: volver al tiempo local con facilidad.

Referencia: MDN PWA.

## 3. Una sola plataforma

- La app instalada y la web usan la **misma API**, las **mismas cuentas** y los **mismos permisos**.
- No se crea una segunda plataforma.
- Distinguir con claridad: **instalar** ≠ **iniciar sesión** ≠ **activar avisos**.

## 4. Funcionamiento sin conexión

| Regla | Detalle |
| --- | --- |
| Shell | Se conserva estructura y recursos estáticos |
| Sin conexión | Mensaje claro de falta de conexión |
| Históricos privados | **No** se almacenan en cachés persistentes en esta primera versión |
| Última lectura pública | Si se conserva: hora de almacenamiento y marcada siempre como **dato guardado**, nunca actual |
| Cierre de sesión / cambio de usuario | Limpiar cachés y estado sensible |

## 5. Actualización

- Recursos versionados de forma **coherente** (`tecrural-shell-*`).
- Permitir recargar de forma comprensible.
- **No** sustituir una versión mientras el usuario está enviando un formulario.
- El cliente debe detectar una **respuesta antigua** aunque llegue desde caché.
- Estrategia: navegación red-primero con respaldo en caché; estáticos `stale-while-revalidate`; assets con hash inmutables.

## 6. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Instalación en Android real | Se instala y reabre en standalone |
| Instalación en iPhone real | Instrucciones correctas (Añadir a pantalla de inicio) |
| Inicio de sesión | Funciona en app instalada y web |
| Ausencia de red | Mensaje claro; sin pantallas vacías |
| Cambio de versión | Recarga coherente; sin mezcla de assets |
| Cierre de sesión + otra cuenta | **Ningún** histórico privado del usuario anterior aparece |
| Formulario en envío | No se sustituye la versión durante el envío |
