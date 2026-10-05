# Motor de avisos, estadísticas e informe automático

## 1. Reglas de aviso verificables

Una regla no dispara por una sola medida. Cada regla declara:

| Campo | Significado |
|---|---|
| `metric` + `comparator` + `threshold` | La condición: por ejemplo, temperatura > 30 °C |
| `min_duration_s` | Tiempo que la condición debe sostenerse antes de avisar. `0` avisa en la primera medida |
| `recovery_margin` | Holgura para cerrar: el aviso no se cierra hasta que la medida vuelve al lado seguro del umbral más allá del margen |
| `urgent` | Excepción: pide al equipo que suba la medida crítica en ese mismo despertar |
| `level` | 1 prioritario, 2 aviso |

Ciclo de vida por regla (`alert_rules.condition_active`, `condition_since`, `active_alert_id`):

```
inactiva ──incumple──▶ pendiente (cuenta min_duration_s)
pendiente ──cumple el tiempo──▶ aviso abierto (uno por regla)
abierto ──vuelve al lado seguro con margen──▶ cerrado por recuperación automática
abierto ──sigue incumpliendo──▶ se mantiene (sin avisos repetidos)
```

La histéresis va en un solo sentido, que es lo que evita el baile: con umbral 30 y margen 2,
el aviso se cierra al bajar de 28, no en cuanto toca 30.

Ficheros: `src/alert-engine.js` (motor), `src/alerts.js` (API), `alert_rules` (tabla).

## 2. Detectores de sistema

Se sembran como reglas con `system = true` y solo lectura por API (`system_rule_readonly`):

- **Sin comunicación**: más de 30 min sin contacto (margen 60 s). Se cierra sola al volver a contactar.
- **Batería baja**: por debajo de `battery_low_mv` de la configuración vigente (margen 100 mV).
  Baja del nivel crítico, el aviso sube a prioritario.

Se evalúan en una pasada periódica del servidor (`SYSTEM_EVAL_INTERVAL_S`, 60 s por defecto),
porque una estación que deja de enviar nunca genera una petición que la pueda disparar.

## 3. Antigüedad de la medida

Cada aviso expone:

- `ageSeconds`: cuánto tiene la medida que lo originó.
- `ingestDelaySeconds`: cuánto tardó en llegar al servidor.

Con lotes de 30 min un aviso puede tener media hora de antigüedad: la interfaz lo indica siempre,
y lo marca en distinto color a partir de 30 min.

## 4. Excepción urgente y su coste en batería

Medir cada 6 min y subir lotes cada 30 min impone hasta 30 min de retraso a un aviso calculado en
servidor. Para una helada eso no sirve.

Lo implementado:

- Una regla marcada `urgent` (siempre de nivel prioritario) emite una **directiva urgente**
  (`urgent_directives`) cuando se cumple su condición.
- `GET /api/config` entrega esa directiva en `_urgent` para el siguiente despertar del equipo.
- Al llegar el siguiente envío, la directiva se libera y queda registrado el antes y después de
  batería (`battery_mv_before`, `battery_mv_after`).
- `GET /api/v1/stations/:id/urgent-impact` calcula, con datos reales de esa estación: gasto de fondo
  (mV/h), coste extra medido por evento urgente, eventos urgentes por día y consumo extra diario
  estimado. Si no hay envíos urgentes medidos, lo declara `sin_datos` en vez de inventar una cifra.

**Pendiente de hacer y medir**: el firmware actual ignora `_urgent`. Para que la excepción funcione
de verdad debe detectar la condición crítica al despertar y subir la medida sin esperar al siguiente
lote. El efecto en batería se mide con este endpoint una vez haya envíos urgentes reales, y solo
entonces tiene sentido decidir si se activa por defecto. En LoRa el mismo pendiente de configuración
sigue siendo válido.

## 5. Informes estadísticos

`GET /api/v1/stations/:id/statistics?from&to` sobre **solo** mediciones validadas y no borradas:

- Por métrica: mínimo, máximo, media, desviación típica, p10/p50/p90, número de muestras.
- Tendencia por mínimos cuadrados, expresada por hora, con dirección `sube` / `baja` / `estable`
  (estable cuando el cambio total no llega al 10 % del rango observado).
- Cobertura: recibidos, válidos, inválidos, esperados según `interval_normal_s`, faltantes
  y porcentajes.
- Serie por bloques (horas) para la gráfica, avisos del periodo y cuántos se resolvieron solos.

## 6. Lo que no se afirma

Estas reglas limitan cualquier informe, automático o humano, sobre esta estación:

1. Solo hay datos de temperatura, humedad, presión, batería e illuminancia.
2. **No se deduce lluvia, viento, riego, heladas ni plagas** a partir de ellos: no hay sensor que los
   mida. Una helada solo puede afirmarse si el propio equipo la detecta.
3. Una pendiente por hora describe la serie; no explica causas.
4. Cualquier cifra se acompaña del periodo, la estación y el porcentaje de datos recibidos.
5. Si faltan datos, se dice que faltan; no se rellena ni se estima sin decirlo.

El endpoint incluye estos límites en `limits` para que la interfaz los muestre.

## 7. Contrato previsto para el bloque de IA (aún no implementado)

Cuando se añada, debería consumir `GET /api/v1/stations/:id/statistics` y:

- citar explícitamente estación, periodo y número de muestras usadas;
- trabajar solo sobre series ya validadas;
- reconocer datos insuficientes (`trend.direction === 'insuficiente'`, `coverage.receivedPct` bajo)
  en lugar de producir una conclusión;
- no introducir magnitudes que los sensores no miden;
- registrar qué periodo y estación usó cada informe generado.