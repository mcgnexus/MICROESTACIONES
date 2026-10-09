# Contrato de recepción, reintento, orden, rechazo y confirmación

Fecha: 2026-10-09
Base: firmware instalado (medición cada 5 min, lotes ~cada 15 min) y código auditado.

## 1. Contrato real del firmware (a conservar)

| Aspecto | Valor |
| --- | --- |
| Cadencia de medición | Cada 5 minutos |
| Cadencia de transmisión | Lotes ~cada 15 minutos |
| Tamaño de lote | `SYNC_BATCH_SIZE = 4` (servidor admite 1–32) |
| Endpoint de subida | `POST /api/measurements` |
| Endpoint de configuración | `GET /api/config` |
| Confirmación de config | `POST /api/config/confirm` |
| Autenticación | `Authorization: Bearer <token>` |
| Identidad de la muestra | `(device_id, sequence, ts)` |

Pendiente de confirmar contra el firmware:
- Cómo persiste `sequence` y `ts` al reiniciar.
- Cómo reconoce el servidor un lote ya recibido.
- Cuándo el dispositivo elimina la muestra de su memoria.

## 2. Flujo de recepción

```
1. Autenticar dispositivo        → requireDevice (token hash)
2. Validar estructura y tamaño   → measurementSchema, 1–32
3. Identificar cada muestra      → (device_id, sequence, ts)
4. Guardar datos + calidad       → dentro de una transacción
5. Confirmar lo almacenado       → ack_through = máxima secuencia aceptada
```

- La identidad actual `(device_id, sequence, ts)` se conserva hasta comprobar su comportamiento real.
- Un futuro identificador de arranque o de muestra se introduce con **contrato nuevo compatible** durante la transición.
- La confirmación se emite **solo** para lo que quedó almacenado.

## 3. Idempotencia y reintentos

| Situación | Comportamiento |
| --- | --- |
| Lote repetido | `ON CONFLICT (device_id, sequence, observed_at) DO NOTHING`; no duplica |
| Acuse perdido | El dispositivo reenvía; el servidor no crea duplicados ni avisos |
| Muestras desordenadas | Se insertan por `observed_at`; no alteran el orden lógico |
| Interrupción a mitad | Transacción completa o ninguna fila |
| Reinicio | La identidad incluye `ts`; un reset de secuencia es distinguible |

Regla de acuse: **no** confirmar un máximo acumulativo que haga descartar muestras faltantes o no guardadas. `ack_through` es la máxima secuencia efectivamente almacenada.

## 4. Aceptación y rechazo

| Caso | Respuesta |
| --- | --- |
| Registro sin ningún canal | Se confirma (para vaciar la cola), no se guarda |
| Canal fuera de rango | Se guarda la fila con `is_validated=false` y `raw_payload` |
| Hora sin referencia / futura | Se conserva para diagnóstico; no alimenta avisos actuales |
| `device_id` no coincide con el token | `403 device_identity_mismatch` |
| Lote vacío o > 32 | `400 invalid_measurements` |

El contrato de aceptación/rechazo debe resolver que el dispositivo **no** retransmita indefinidamente una muestra estructuralmente válida pero marcada como dudosa.

## 5. Separación de conceptos

| Concepto | Uso |
| --- | --- |
| Muestra almacenada para diagnóstico | Se conserva aunque no sea utilizable |
| Muestra utilizable para meteorología | `is_validated` y tiempo admisible |
| Último contacto autenticado | `device_status.last_contact` |
| Última medición admisible | `device_status.last_valid_data` |

- Lotes atrasados se guardan en el histórico.
- Los lotes atrasados **no** abren ni cierran avisos actuales.
- Último contacto y última medición admisible se mantienen por separado.

## 6. Validación frente al firmware instalado

| Escenario | Resultado esperado |
| --- | --- |
| Lote repetido | Sin duplicados; sin avisos duplicados |
| Acuse perdido | Reintento seguro |
| Muestras desordenadas | Orden lógico correcto |
| Interrupción a mitad de operación | Sin filas parciales |
| Reinicio | Identidad distinguible por `ts` |
| Memoria llena | Las muestras no confirmadas se retransmiten |
| Hora no sincronizada | Se conserva; no es «actual» |
| Varias horas sin conexión | Recuperación sin pérdida de datos confirmados |
