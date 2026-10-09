# Validación física de la estación — ficha, contraste y autonomía

Fecha: 2026-10-09
Principio: ninguna estación aparece como contrastada sin evidencia registrada. Un salto anómalo o una instalación pendiente se comunica como incertidumbre.

## 1. Ficha de instalación

| Campo | Contenido |
| --- | --- |
| Sensor | AHT20 / BMP280 |
| Controlador | ESP32-C3 |
| Alimentación | Fuente/batería, con tensiones |
| Protección | Frente a sol y lluvia |
| Ventilación | Tipo y descripción |
| Altura | Altura de montaje |
| Entorno cercano | Muros, suelo, vegetación |
| Conectividad | Tipo y disponibilidad |
| Fechas | Instalación y revisiones |
| Fotografías | Evidencia visual |
| Responsable | Persona que instala/verifica |
| Coordenadas | **Medidas o aproximadas** (declararlo) |

## 2. Contraste simultáneo con referencia

- Comparación **simultánea** con una referencia adecuada en condiciones documentadas.
- Evaluar: sesgo, dispersión y cambios diurnos/nocturnos.
- Fijar tolerancias según especificaciones del fabricante y uso pretendido.
- AEMET, en otro emplazamiento, **no** sirve para calibrar por simple igualación de valores.

| Registro de verificación | Contenido |
| --- | --- |
| `status` | `unverified` / `pending` / `verified` |
| `reference` | Referencia usada |
| `method` | Método |
| `date` | Fecha |
| `error` / `bias` | Error y sesgo |
| `conditions` / `limitations` | Condiciones y limitaciones |
| `tolerance` | Tolerancia acordada |
| `responsible` | Responsable |

## 3. Autonomía y comportamiento

Comprobar:
- Autonomía real.
- Comportamiento con batería baja.
- Memoria disponible.
- Recuperación tras cortes.
- Procedimiento de recarga o mantenimiento.

La programación de **avisos urgentes** requiere conocer esas restricciones (`urgent_directives`, `batteryImpact`).

Hasta confirmar la conectividad, describir el dispositivo como **transmisor HTTPS con almacenamiento local**; no prometer funcionamiento en fincas sin red.

## 4. Heladas localizadas

- Recoger noches completas en los puntos de interés, con calidad y horas verificadas.
- Distinguir: cruce de un umbral del aire medido ≠ daño en cultivo ≠ previsión.
- La estación urbana no describe todas las parcelas.
- Una serie sin temperaturas próximas a cero **no** valida un servicio de heladas.

## 5. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Estación sin evidencia | No aparece como contrastada |
| Salto anómalo | Se comunica como incertidumbre; no se oculta |
| Instalación pendiente | Se marca; no se atribuye a microclima |
