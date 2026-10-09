# Servicio contratado sin cobro automático

Fecha: 2026-10-09
Base: `services` (nueva), `installations`, `station_access`, `subscribers`, `audit_logs`.
Principio: gestionar los dos pilotos y las primeras altas de forma **supervisada**. No automatizar pagos en el MVP solo para aparentar acabado.

## 1. Registro del servicio

Registrar, por cada piloto o alta:
- Oferta aceptada.
- Periodo (inicio/fin).
- Precio.
- Condiciones.
- Estación asignada.
- Situación de pago.

La facturación se hace con el sistema habitual **fuera** de la app; se guarda su referencia cuando proceda.

## 2. Estados del servicio

| Estado | Significado |
| --- | --- |
| Solicitado | Petición recibida |
| Aprobado | Oferta aceptada por ambas partes |
| Pendiente de instalación | Equipo por instalar |
| Piloto activo | Periodo de prueba en marcha |
| Servicio activo | Contrato en vigor |
| Suspendido | Servicio pausado |
| Finalizado | Baja o retirada |

Reglas:
- Un **registro gratuito no activa** una estación.
- Una **solicitud no supone** aceptación de contrato.
- Un clic administrativo deja **rastro** de quién activó o modificó el servicio (`audit_logs`).

## 3. Matriz de derechos por estado

| Estado | Acceso a estación | Histórico | Exportación | Avisos |
| --- | --- | --- | --- | --- |
| Solicitado | No | No | No | No |
| Aprobado | No | No | No | No |
| Pendiente de instalación | No | No | No | No |
| Piloto activo | Asignada | 90 días | Sí (sus datos) | Tras pruebas |
| Servicio activo | Asignada | 90 días | Sí (sus datos) | Sí |
| Suspendido | No | Según condiciones | No | No |
| Finalizado | No | Según condiciones | No | No |

- Los derechos dependen del **servicio y la asignación vigente**, no de un indicador de pago enviado por el navegador.
- Al finalizar: aplicar la política acordada de acceso a histórico, exportación y retirada del equipo.
- Mantener la separación entre datos del cliente y los de futuras instalaciones.
- El usuario **conserva** su acceso gratuito y sus derechos sobre la cuenta.

## 4. Ficha de condiciones por piloto

Cada piloto conserva **las condiciones y el precio realmente acordados**. La cuota de 100 €/mes es hipótesis comercial, no tarifa automática.

| Campo | Contenido |
| --- | --- |
| Precio | Acordado por piloto |
| Impuestos | Especificados |
| Instalación | Incluida / no |
| Mantenimiento | Condiciones |
| Conectividad | Responsable |
| Duración | Periodo |
| Baja | Procedimiento |
| Retirada | Condiciones del equipo |

## 5. Antes de automatizar pagos

Definir previamente:
- Impuestos.
- Periodicidad.
- Prorrateos.
- Impagos.
- Cancelación.
- Facturas.
- Condiciones contractuales.

Una futura integración de pagos deberá:
- Verificar **firmas** de las confirmaciones.
- Garantizar **idempotencia** de los webhooks.

No se implementa en el MVP.

## 6. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Alta gratuita | No activa estación |
| Activación de piloto | Asigna estación; deja rastro |
| Conversión a pago | Cambia estado sin duplicar identidad |
| Suspensión | Servicio privado no disponible; acceso gratuito conservado |
| Baja | Revoca acceso y registra retirada |
| Traslado de equipo | Nueva instalación; histórico ligado a la instalación de cada muestra |
| Cada estado | El usuario conserva **exclusivamente** los derechos que le corresponden |
