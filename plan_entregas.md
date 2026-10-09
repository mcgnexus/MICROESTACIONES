# Programación por entregas con puerta de aceptación

Fecha: 2026-10-09
Regla: cada entrega produce una versión revisable. No se pasa a la siguiente si el criterio esencial de la anterior falla.

| Entrega | Trabajo | Puerta de aceptación |
| --- | --- | --- |
| **A. Base protegida** | Inventario, entornos, copia restaurada y contratos existentes | Se puede probar sin afectar a producción |
| **B. Datos fiables** | Recepción, tiempo, calidad, históricos, AEMET y emparejamiento | Lotes sin pérdida; tiempos correctos; comparación de referencia reproducible |
| **C. Web pública terminada** | Portada, evolución, explicación y estados de error | Cinco usuarios la entienden; móvil y teclado funcionan |
| **D. Captación** | Registro por correo y solicitud comercial breve | Cuenta verificada con acceso real; solicitud visible en administración |
| **E. PWA** | Instalación, reapertura, actualización y falta de conexión | Android/iPhone comprobados; ninguna caché privada compartida |
| **F. Servicio privado** | Asignaciones, estados del piloto y panel del cliente | Dos cuentas aisladas y traslado de estación probado |
| **G. Avisos supervisados** | Reglas en evaluación, episodios y cola; después un canal externo | Casos de fallo resueltos y latencia medida antes de ofrecer envíos |
| **H. Lanzamiento piloto** | Migración, monitorización, presupuesto y seguimiento | Lista de lanzamiento completa y reversión practicable |

## Orden de publicación

- La **consulta pública** y la **captación** pueden publicarse antes de los avisos externos.
- La oferta indicará **únicamente lo operativo**.
- Esto exige una web completa en su alcance y estados, no botones de «próximamente».

## Calendario

- **No** fijar un calendario cerrado sin conocer disponibilidad de programación y resultados de la migración.
- Revisar cada entrega con **demostración y evidencias**, no por número de pantallas.

## Mapa con la documentación

| Entrega | Documentos de referencia |
| --- | --- |
| A | `inventario_referencia.md`, `arquitectura_decisiones.md` |
| B | `contrato_recepcion.md`, `politica_calidad.md`, `aemet_adaptadores.md`, `comparacion_aemet.md` |
| C | `pantallas_minimas.md`, `recorridos_usuario.md` |
| D | `registro_acceso.md`, `captacion_seguimiento.md` |
| E | `pwa_instalacion.md` |
| F | `permisos_publicacion.md`, `modelo_datos.md`, `servicio_contratado.md` |
| G | `avisos_episodios.md`, `cola_programador.md` |
| H | `panel_operativo_costes.md`, `matriz_pruebas.md`, `seguridad_privacidad.md`, `ficha_instalacion.md` |
