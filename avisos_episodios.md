# Avisos por episodios y activación por fases

Fecha: 2026-10-09
Base: `alert-engine.js` (`evaluateRule`, `evaluateMeasurementRules`), `alert_rules`, `alerts`.

## 1. Categorías independientes

| Categoría | Naturaleza |
| --- | --- |
| Aviso local | Umbral **ya observado** en el emplazamiento |
| Previsión | Dato externo, orientativo |
| Aviso oficial | AEMET |

- Un aviso local **no** predice una helada ni garantiza evitar pérdidas.

## 2. Activación por fases

| Fase | Alcance |
| --- | --- |
| 1 | Reglas en modo **evaluación**, sin envíos externos |
| 2 | Avisos visibles en la app y revisión con pilotos |
| 3 | **Un solo** canal externo, verificado de principio a fin |

Incorporar nuevos canales solo tras validar utilidad y coste del primero.

## 3. Anatomía de una regla

Cada regla tiene: estación, variable, umbral, sentido del cruce, criterio de recuperación, vigencia, destinatarios y **versión**.

| Campo | Uso |
| --- | --- |
| `comparator` | Sentido del cruce (`gt`/`gte`/`lt`/`lte`) |
| `threshold` | Umbral |
| `min_duration_s` | Duración mínima sostenida |
| `recovery_margin` | Histéresis para recuperar |
| `recovery_threshold` | Umbral explícito de recuperación |
| `recovery_duration_s` | Tiempo a salvo antes de cerrar |
| `cooldown_s` | Anti-repetición |
| `category` | Categoría |
| `enabled` | Vigencia |

- **Histéresis**: evita aperturas/cierre por pequeñas oscilaciones (`recoverySatisfied`).
- Una preferencia guardada solo se presenta como operativa si **cambia realmente** la regla aplicada.

## 4. Máquina de estados del episodio

| Estado | Significado |
| --- | --- |
| Abierto | Condición observada sostenida |
| Recuperado | Volvió al lado seguro |
| Descartado | Con motivo |

Acciones internas del motor: `idle`, `start`, `pending`, `cooldown`, `open`, `hold`, `recovering`, `recover`.

- Reconocer un aviso **no** significa que la condición haya desaparecido.
- Cada apertura y recuperación se asocia a sus muestras y regla (`measurement_id`, `rule_id`).
- **La falta de datos no equivale a recuperación**: genera incertidumbre o incidencia de conexión.

## 5. Orden y lotes atrasados

- El motor evalúa muestras **admisibles**, con hora utilizable y recientes, en orden **cronológico**.
- No retrocede el estado por datos históricos.
- Al recuperar un lote con un cruce y una recuperación ya pasados: se conserva el episodio histórico; **no** se envía un mensaje que lo describa como activo ahora.
- Si el riesgo continúa en la última muestra reciente: se decide con el estado actual y se registra el origen.

## 6. Umbrales

- **No** se activan umbrales agronómicos universales.
- TecRural y el piloto acuerdan umbral y recuperación, documentando el uso.
- Un umbral ilustrativo de demostración permanece **separado** de la configuración real.

## 7. Latencia

La cadencia limita la rapidez: el cruce puede esperar a la siguiente medición y esta al envío del lote. Estimación prudente sin cadencias alineadas: **hasta ~20 min** antes de recepción, más procesamiento y entrega, sin contar cortes. **No es una garantía.**

Medir por separado: cruce estimado, observación, recepción, apertura, envío y confirmación. Cualquier objetivo de latencia se demuestra antes de publicarlo.

## 8. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Oscilación alrededor del umbral | No abre/cierra repetidamente (histéresis) |
| Retransmisión | No repite el aviso (`dedupe_key`) |
| Lote atrasado | Episodio histórico; no aviso «activo ahora» |
| Recuperación antes de transmitir | Se conserva el episodio |
| Ausencia de datos | No se declara recuperada; incertidumbre |
| Regla modificada | Nueva versión; rastro |
| Destinatario revocado | No recibe |
