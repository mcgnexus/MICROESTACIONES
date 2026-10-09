# Migración, lanzamiento y revisión con los dos pilotos

Fecha: 2026-10-09
Base: `migrate.js`, `docs/publicacion.md`, `retention.js`.

## 1. Estrategia de migración

Aplicar cambios de esquema **compatibles con la versión anterior**:

1. **Añadir y poblar primero.**
2. **Cambiar lecturas/escrituras después.**
3. **Retirar legado** solo cuando deje de utilizarse.

- Vincular **versión de aplicación + esquema + firmware admitido**.
- **No** borrar tablas, historiales o cuentas para simplificar la interfaz.
- Migraciones aditivas e idempotentes (`ALTER ... IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

## 2. Ensayo de la migración

Con **copia de pruebas**, comparar:
- Recuentos.
- Identidades de muestras (`(device_id, sequence, observed_at)`).
- Permisos (`station_access`).
- Instalaciones (`installations`).
- Resultados de referencia (emparejamiento AEMET).

Si se corrigen fechas AEMET: mediante **transformación trazable** basada en datos originales o evidencia suficiente; **no** desplazar todo el histórico por intuición.

## 3. Reversión

- **Reversión de aplicación**: volver a la versión anterior.
- **Estrategia de datos**: volver a una versión anterior **no** deshace una migración ni las tareas programadas.
- Si hiciera falta restauración: definir cómo **conservar las mediciones recibidas** después del punto de copia y reconciliar bajas y permisos posteriores.

## 4. Objetivos de recuperación (propuesta de piloto)

| Objetivo | Meta propuesta |
| --- | --- |
| Tiempo objetivo de recuperación (RTO) | 4 horas |
| Pérdida máxima admisible (RPO) | 15 minutos de datos ya recibidos |

- Objetivos de **diseño**, pendientes de comprobar con el plan de base, sus copias y una **restauración cronometrada**.
- **No** publicarlos como garantía.
- Si el presupuesto no los permite: acordar y documentar otros **antes** de activar el servicio privado.

## 5. Lista obligatoria de lanzamiento

- [ ] Datos locales reales y ubicación correctamente descrita.
- [ ] Comparación temporal reproducible y fuentes externas independientes.
- [ ] Registro recibido y utilizado en un buzón de prueba.
- [ ] Solicitud comercial persistida y visible.
- [ ] Permisos de dos cuentas privadas comprobados.
- [ ] Instalación y actualización PWA verificadas.
- [ ] Programador y cola observados sin visitas.
- [ ] Copia restaurable y procedimiento de reversión.
- [ ] Identidad legal, privacidad y condiciones revisadas.
- [ ] Coste mensual, límites de gasto y responsable operativo definidos.
- [ ] Avisos externos ocultos o claramente desactivados hasta superar sus pruebas.

## 6. Revisión a 14 días

- Facilidad de consulta.
- Registro.
- Retornos.
- Calidad del dato.
- Problemas de instalación.

## 7. Revisión a 30 días

- Solicitudes cualificadas.
- Propuestas aceptadas.
- Continuidad de los dos pilotos.
- Precio que realmente aceptan pagar.
- Tiempo de soporte.

## 8. Criterios de validación comercial

| Criterio | Meta |
| --- | --- |
| Comprensión de la oferta | 4 de 5 usuarios la entienden |
| Continuidad de pago | Al menos 1 de los 2 pilotos acepta con condiciones explícitas y margen calculado |

- Con dos pilotos, es una **señal inicial**, no una validación estadística del mercado.
- Si **ambos** continúan pagando: reforzar captación local.
- Si **ninguno** lo hace: analizar problema, utilidad, precio y coste **antes** de añadir funciones.

## 9. Entregable

- Versión publicada identificable (commit + esquema + firmware).
- Acta de lanzamiento (lista de comprobación firmada).
- Revisión comercial con decisión sobre **continuar, ajustar o detener** cada función.
