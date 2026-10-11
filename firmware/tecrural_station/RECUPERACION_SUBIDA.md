# Recuperación de la subida de medidas

## Evidencia del incidente (10 octubre 2026)

La base recibió 24 medidas pendientes (1580–1603) tras un reinicio manual.
Después no hubo nuevas recepciones durante aproximadamente 28 minutos. Los
logs consultados mostraron HTTP 200 para los lotes recuperados y ningún POST
posterior en el intervalo consultado. Esto prueba recuperación y conservación
de la cola, pero no identifica por sí solo el motivo de los fallos HTTPS.

## Cambios del firmware

- `TimeKeeper::uptimeSeconds()` incluye los segundos de sueño programados.
  Antes `advance()` guardaba solo el tiempo despierto en ese contador.
- La programación de subida utiliza ese tiempo transcurrido, no la hora UTC que
  cambia cuando se aplica la cabecera Date del servidor.
- Una subida sin progreso se vuelve a intentar en el siguiente ciclo de medida.
- Tres ciclos consecutivos sin progreso reinician el chip, conservando LittleFS
  y las secuencias pendientes. Un acuse parcial que retira medidas cuenta como
  progreso y pone el contador a cero.
- Los rechazos 4xx (excepto 408/429) no provocan reinicios: un reset no corrige
  una credencial o un payload inválido.
- Un fallo DNS se identifica como código local `-100` y no inicia HTTPS.
- Se conserva la validación TLS con el paquete de CA; no se desactiva.

No se modifican ni se corrigen retrospectivamente los timestamps ya almacenados.
El contador es una estimación del tiempo transcurrido durante sueño, no un reloj
de precisión. Un bloqueo que impida terminar un ciclo necesita diagnóstico aparte.

## Compilación y puesta en marcha

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32c3 --board-options CDCOnBoot=cdc firmware/tecrural_station
```

`sync_policy_checks.cpp` verifica en compilación primer envío, intervalo de
15 minutos, overflow, cola vacía, sincronización desactivada, reintento tras
fallo, acuse parcial, fallo TLS/5xx/4xx y umbral de recuperación.

Para instalar, conectar **la ESP32-C3 medidora**, identificar su puerto y cargar
solo el firmware, sin borrar flash ni cambiar la tabla de particiones.
Conservar `src/secrets.h` local; no copiar su token a la OLED.

## Verificación física pendiente

1. Capturar al menos dos ciclos de sincronización con Internet disponible.
2. Comprobar `[sync] toca=si`, HTTP 200 y reducción de pendientes a cero.
3. Cortar la salida a Internet manteniendo WiFi y verificar que la cola crece,
   que aparecen DNS/TLS/HTTP y que tras tres ciclos sin progreso se recupera.
4. Restaurar Internet: los pendientes deben enviarse, con sus secuencias originales.
5. Comprobar hora UTC contra Date del servidor y `received_at`; no basta con
   que el campo almacenado de conectividad diga `online`.

La OLED es observadora: sus GET de diagnóstico no insertan medidas. Usar
`receivedAt` para comprobar nuevas subidas. `lastContact` también cambia si se
consulta `/api/config` con el token del sensor.
