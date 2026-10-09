# Matriz de pruebas alrededor de riesgos reales

Fecha: 2026-10-09
Base: `node --test`, `acceptance.mjs`, `acceptance-phase13.mjs`, `migrate.js`.

## 1. Tres niveles

| Nivel | Alcance |
| --- | --- |
| Pruebas de reglas | Lógica pura (validación, emparejamiento, episodios) |
| Integración con PostgreSQL real | Base de **pruebas**, no ficticia |
| Recorridos de navegador | Flujos de usuario de extremo a extremo |

- Las integraciones externas tendrán **respuestas de referencia** y comprobaciones controladas del servicio real.
- Probar la **migración y restauración** aparte.
- No aceptar como validación completa que la compilación pase o que las pruebas con base ficticia sean verdes.

## 2. Casos obligatorios

| Caso | Resultado obligatorio |
| --- | --- |
| Público sin cuenta | Consulta real y comprensible sin formulario obligatorio |
| Muestra antigua | Hora visible; no aparece como actual |
| Nulo o canal inválido | No se convierte en cero ni se oculta su significado |
| Lote repetido o acuse perdido | Sin pérdida ni duplicados lógicos |
| Lote antiguo con cruce de umbral | Histórico conservado; no crea aviso actual falso |
| AEMET fallida | Dato local operativo; error externo explícito |
| Pareja 14:00 del 9 de octubre | Se comparan las muestras coincidentes, no la local de 14:39 |
| Cambios de horario y zona del navegador | Instantes e intervalos correctos |
| Registro completo | Correo recibido, confirmación y acceso al histórico |
| Token caducado, reutilizado o escaneado | Sin accesos indebidos ni inutilización prematura |
| Cliente A solicita datos de B | Acceso denegado también en exportaciones |
| Cambio de instalación de estación | Cada histórico conserva emplazamiento y privacidad |
| Solicitud con promoción rechazada | Se guarda y puede tramitarse |
| Cola sin tráfico web | Se procesa de forma independiente |
| Dos ejecutores y fallo del proveedor | Reserva, recuperación y estado trazable |
| Datos ausentes durante un episodio | No se declara recuperado sin evidencia |
| PWA sin conexión y cambio de cuenta | Datos guardados identificados; sin filtración privada |
| Copia restaurada | Datos recuperables y permisos/bajas preservados |

## 3. Condiciones de las pruebas

- Contratos contra **PostgreSQL real de pruebas**.
- Permisos de **cuentas distintas**.
- Recorrido de **correo real**.
- Las pruebas **no** crean clientes, avisos ni mensajes en producción sin un procedimiento específico.

## 4. Registro de resultados

Cada prueba anota: fecha, versión, entorno, resultado y evidencia.

## 5. Defectos abiertos por impacto

| Impacto | Descripción |
| --- | --- |
| Crítico | Filtración de datos, pérdida de datos confirmados |
| Alto | Registro ficticio, comparación engañosa |
| Medio | Aviso presentado como activo con datos antiguos |
| Bajo | Cosmético |

## 6. Validación

No quedan defectos que permitan:
- filtraciones,
- pérdida de datos confirmados,
- registro ficticio,
- comparaciones engañosas,
- avisos presentados como activos con datos antiguos.
