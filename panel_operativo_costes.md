# Fiabilidad, costes y utilidad comercial — cuadros operativo y comercial

Fecha: 2026-10-09
Base: `admin.js`, `analytics.js`, `retention.js`, `schedulerState()`, `/api/v1/maintenance/status`.

## 1. Cuadro operativo

Estado por estación y por sistema:

| Indicador | Fuente |
| --- | --- |
| Estado por estación | `device_status` |
| Edad de última muestra admisible | `last_valid_data` |
| Último contacto | `last_contact` |
| Cola pendiente | `notification_outbox` |
| Trabajos fallidos | `notification_outbox.status = failed` |
| Fuentes externas | `external_weather_snapshots` |
| Ejecución del programador | `schedulerState()`, `/api/v1/maintenance/status` |
| Versión desplegada | build/commit |

- Detectar la ausencia de ejecución mediante **comprobación externa**: un programador parado no puede avisar fiablemente de su propia parada.
- Mostrar incidencias con una **acción concreta**.
- Distinguir: equipo conectado ≠ datos utilizables ≠ fuente externa disponible ≠ aviso abierto.
- Evitar un «todo en orden» que oculte un canal fallido.
- Registrar tiempos y contadores; limitar volumen y retención para no aumentar costes.

## 2. Magnitudes orientativas (nominales)

| Concepto | Una estación | Dos estaciones |
| --- | --- | --- |
| Muestras cada 5 min | 288/día | 576/día |
| Muestras en 30 días | 8.640 | 17.280 |
| Envíos cada 15 min | 96/día | 192/día |
| Envíos en 30 días | 2.880 | 5.760 |
| Ejecutor cada 1 min | ~43.200 invocaciones/30 días | igual (independiente de visitantes) |

- Estimaciones **nominales**: no incluyen reintentos, configuración, duplicados ni otras consultas.
- El coste del ejecutor y de las conexiones de base entra en el presupuesto.

## 3. Rendimiento de la interfaz

- Consultar datos cada ~60 s **solo** mientras la página es visible; al recuperar foco.
- Suspender consultas en segundo plano.
- Consolidar respuestas de portada y limitar puntos de gráficos.
- Caché pública compartida; evitar filas ilimitadas.
- Índices por estación e instante primero; **medir** antes de particionar o cambiar de base.

## 4. Objetivos técnicos (pruebas, no resultados actuales)

| Objetivo | Meta |
| --- | --- |
| Contenido principal usable | ~3 s en móvil de referencia con red limitada |
| API pública | < 1 s en p95 bajo carga de piloto acordada |

- Registrar condiciones, calentamiento y llamadas en frío.
- Prueba inicial orientativa: **50 visitantes concurrentes** y **20 estaciones simuladas** durante un periodo limitado; adaptar al público esperado y usar pruebas **aisladas**.

## 5. Coste por cliente

Sumar:
- Alojamiento.
- Base de datos.
- Envíos.
- Conectividad.
- Mantenimiento.
- Tiempo de soporte.
- Desplazamientos.
- Amortización de instalación, protección y electrónica.

- Los **20–25 € de fabricación** no representan el coste total del servicio.
- Comparar la cuota acordada con todos los costes e impuestos.
- **No** declarar margen validado sin esos datos.

## 6. Cuadro comercial

| Métrica | Definición | Denominador |
| --- | --- | --- |
| Cuentas verificadas | `email_verified_at` no nulo | Solicitudes de acceso |
| Primera consulta del histórico ampliado | Acción real, no clic | Cuentas verificadas |
| Usuarios que regresan | Sesión en ≥ 2 periodos | Cuentas verificadas |
| Solicitudes cualificadas | Etapa «cualificada» | Solicitudes recibidas |
| Propuestas | Etapa «propuesta enviada» | Cualificadas |
| Pilotos que continúan pagando | Servicio activo tras piloto | Pilotos iniciados |
| Ingreso recurrente | Suma de cuotas vigentes | — |
| Horas de soporte | Registro manual | Cliente |

- La instalación de PWA es **señal secundaria**, no un lead.
- **No** incluir email, teléfono ni coordenadas privadas en eventos de analítica.

## 7. Validación

| Escenario | Resultado esperado |
| --- | --- |
| Estación sin datos | Detectada en el cuadro operativo |
| Proveedor caído | Detectado; dato local sigue operativo |
| Cola parada | Detectada por comprobación externa |
| Cifras | Cuadran con sus ventanas |
| Conversión | Corresponde a una acción real, no a un clic |
