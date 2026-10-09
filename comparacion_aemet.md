# Especificación del emparejamiento AEMET — comparación por coincidencia temporal

Fecha: 2026-10-09
Base: `compareTemperatures` (weather.js), `AEMET_PAIR_WINDOW_MS = 10 min`, `aemetPairWindowMs` (configurable 1–60 min).

## 1. Principio

Mostrar **dos cosas distintas**:
1. El tiempo local **más reciente**.
2. La **última comparación válida**.

No calcular diferencia si esas últimas lecturas pertenecen a horas diferentes.

## 2. Procedimiento obligatorio

| Paso | Acción |
| --- | --- |
| 1 | Tomar una observación AEMET admisible y buscar la medición local **temporalmente más próxima**, no solo la última disponible |
| 2 | Exigir separación máxima de **10 minutos** (tolerancia de comparación, no certificación de simultaneidad) |
| 3 | Resolver empates de forma **determinista**; comprobar calidad y referencia temporal de ambas muestras |
| 4 | Calcular sobre **valores originales**; presentar ambas horas, fuentes, ubicación, separación y diferencia con **una sola política de redondeo** |
| 5 | Si la última observación no tiene pareja, buscar la pareja más reciente dentro del **histórico autorizado** y mostrar su fecha; si es antigua, no llamarla «actual» |
| 6 | Mostrar **motivo concreto** cuando no pueda compararse |

## 3. Estados y motivos

| `state` | Significado | Motivo |
| --- | --- | --- |
| `matched` | Pareja dentro de la ventana | — |
| `no_pair` | Hay datos pero sin pareja temporal | `no_observation_within_window` |
| `missing` | Falta un lado | `no_local_data` / `no_aemet_data` |
| `untrusted` | Hora incierta | `untrusted_time` |
| `not_admissible` | Canal no admisible | `channel_not_admissible` |

## 4. Resolución de empates

- Se ordena por `|Δ tiempo|` y, en empate, por **identidad** (secuencia + instante) y **revisión**.
- No se promedian por defecto.
- Se conserva el rastro del conflicto.

## 5. Presentación

| Campo | Regla |
| --- | --- |
| Valor local | Original, con su hora |
| Valor AEMET | Original, con su hora |
| Separación | `timeOffsetSeconds` y ventana (`windowMinutes`) |
| Diferencia | `local − AEMET`, redondeo único |
| Definición | `temperatura_microestacion_menos_AEMET` |
| Ubicación | Distancia, altitud y fuente de cada estación |
| Fuente | AEMET / estación de observación |

Una sola política de redondeo en **portada, tabla e informe**; los valores originales se conservan para cálculos.

## 6. Caso de aceptación (9 de octubre)

| Muestra | Valor | Hora |
| --- | --- | --- |
| AEMET | 20,4 °C | 14:00:00 |
| Local pareja | 20,4 °C | 14:00:37 |
| Local posterior | 21,8 °C | 14:39:20 |

Resultado:
- La pareja de las 14:00 **coincide** a la precisión visible (Δ 0,0 °C; separación 37 s).
- La lectura de las 14:39 **no** permite atribuir 1,4 °C de diferencia al emplazamiento: está fuera de la ventana de 10 min.
- La portada muestra el tiempo local más reciente (14:39) y, por separado, la última comparación válida (14:00).

## 7. Informes de un periodo

Indicar:
- Número de parejas.
- Fechas.
- Separación temporal.
- Huecos.
- Diferencias **firmadas** y **absolutas**.
- Limitaciones.

Prohibiciones:
- No atribuir todo el resultado a la altitud.
- No anunciar significación estadística sin un diseño de análisis apropiado.
- No aplicar una corrección permanente de dos grados.

## 8. Casos de referencia

| Caso | Resultado esperado |
| --- | --- |
| Caso del 9 de octubre | Pareja 14:00 `matched`; 14:39 no comparada |
| Falta de pareja | `no_pair` con motivo |
| Empate | Resolución determinista por identidad/revisión |
| Dato anómalo | Canal no admisible → `not_admissible` |
| Comparación antigua | Se muestra su fecha; no se llama «actual» |
| Cambio UTC/Madrid | Misma pareja; solo cambia la presentación |
| Diferencia cerca de cero | Se muestra 0,0 °C, no se oculta |
| Portada / tabla / informe | Mismo resultado en los tres |
