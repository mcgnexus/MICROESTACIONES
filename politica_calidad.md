# Política de calidad, tiempo y trazabilidad meteorológica

Fecha: 2026-10-09
Base: `validation.js` (VFLAG), `measurement-policy.js` (clasificación temporal) y `statistics.js`.

## 1. Validación por canal independiente

- Cada canal (temperatura, humedad, presión, batería, lux) se valida por separado.
- Un canal inválido **no** invalida automáticamente otros canales utilizables.
- Las banderas del firmware se interpretan según su contrato real; **cero no significa válido**.
- `validation_flags` conserva defectos parciales aunque la fila sea admisible por otro canal.

| Bandera (VFLAG) | Bit | Significado |
| --- | --- | --- |
| TEMP | 0 | Temperatura fuera de rango o marcada no válida |
| HUM | 1 | Humedad fuera de rango o marcada no válida |
| PRESS | 2 | Presión fuera de rango o marcada no válida |
| BATT | 3 | Batería fuera de rango o marcada no válida |
| LUX | 4 | Lux fuera de rango |
| MANUAL | 5 | Revisión manual |
| TIME | 6 | Hora sin referencia o futura |
| DEVICE | 7 | Identidad de dispositivo |

## 2. Tres conceptos separados

| Concepto | Definición | No implica |
| --- | --- | --- |
| Dato recibido | Lo que llegó del equipo | No es admisible |
| Dato admitido | Pasa los controles automáticos | No es exacto |
| Sensor contrastado | Comparado con referencia | No elimina sol, pared, electrónica ni mala ventilación |

La validación del software **no** acredita calibración.

## 3. Tiempo

No se admite como «actual»:
- una hora basada únicamente en tiempo desde arranque (`quality = 0`);
- una fecha ambigua;
- una observación indebidamente futura (tolerancia `FUTURE_CLOCK_TOLERANCE_MS = 5 min`).

Se conserva el registro para diagnóstico. La tolerancia temporal se contrasta con el comportamiento del reloj.

### Estados de antigüedad de la muestra mostrada como actual

| Estado | Ventana | Objetivo del piloto (configurable) |
| --- | --- | --- |
| Reciente | ≤ 20 min | Objetivo, no garantía |
| Retrasada | 20–45 min | Objetivo, no garantía |
| Antigua | > 45 min | Objetivo, no garantía |

La **conexión** usa un criterio independiente basado en los contactos y el intervalo de sincronización (`connectivityFor`).

Regla estricta: **nunca** sustituir un canal inválido por cero.

## 4. Muestras con el mismo instante

- Se resuelven de forma **determinista** por identidad y revisión; no se promedian por defecto.
- Se mantiene el rastro de conflictos.

## 5. Redondeo

- Una sola política de redondeo en tarjeta, tabla, gráfico y exportación.
- Los valores originales se conservan para los cálculos.
- Diferencias de humedad relativa en **puntos porcentuales**.

## 6. Gráficas y cobertura

- Las gráficas muestran **huecos**; no se interpola ni se extiende la línea para ocultar una desconexión.
- Se declara el periodo y el método de cada tendencia.
- La cobertura se calcula desde el **inicio real de la instalación** y con las **cadencias efectivas**.
- Se diferencian **huecos temporales** de **saltos de secuencia** (`sequenceIntegrity`, `expectedBetween`).

## 7. Casos de referencia

| Caso | Comportamiento |
| --- | --- |
| Nulos | Columna `null`, nunca cero |
| Saltos rápidos | Se conservan; no se suavizan |
| Dos lecturas mismo instante | Resolución determinista, no promedio |
| 18,15 °C | Redondeo único y consistente en toda la interfaz |
| Cambio de horario | Almacenamiento UTC; presentación Europe/Madrid |
| Navegador en otra zona | La presentación no altera el instante almacenado |
| Estación recién instalada | Cobertura desde el inicio real, no desde el periodo nominal |
| Cambio de cadencia | Cobertura con la cadencia efectiva |

## 8. Regla de oro

No corregir automáticamente un sensor para que coincida con AEMET. La comparación informa; no recalibra.
