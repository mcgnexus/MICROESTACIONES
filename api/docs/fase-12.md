# Fase 12: medición agregada y confianza

## Puesta en servicio

Ejecutar `npm run migrate` en `api`: crea `metric_daily` y `metric_milestones`. Los eventos empiezan al desplegar esta fase, sin reconstrucción histórica. Configurar `ANALYTICS_CAMPAIGNS` con un catálogo revisado de nombres genéricos, separados por comas (máximo 30; letras, guiones y guiones bajos). No usar nombres de personas, teléfonos, correos ni códigos únicos. Si está vacío, las campañas se agrupan como `none`.

Source permitido: google, bing, facebook, instagram, whatsapp, qr, newsletter, partner. Medium: organic, social, email, cpc, qr, referral. Son etiquetas de campaña explícitas, no inferencias del referente. No se envían URLs, referrer, content, term, ref, correos, teléfonos, tokens ni coordenadas al sistema de métricas. Los valores desconocidos se agrupan en other/none. Sin source se usa direct, que significa sin campaña source identificada, no una atribución demostrada de tráfico directo.

## Eventos y consentimiento

| Evento | Disparo y unidad |
| --- | --- |
| home_visit | Portada visible, tras aceptar medición; una vez por carga de página |
| locked_tool_open | Abrir panel, estaciones o avisos sin sesión; solo tras aceptar y una vez por carga |
| access_requested | Nueva emisión de enlace de acceso o solicitud pública guardada; reenvíos de enlace pueden incrementar el total, duplicados de formulario no |
| contact_verified | Primera verificación de correo por enlace o confirmación de un canal por código; una vez por cuenta |
| first_expanded_query | Primera vista ampliada cargada correctamente por una cuenta viewer; una vez por cuenta |
| agricultural_profile_completed | Primera declaración completa de municipio, actividad agrícola/ganadera/mixta, cultivo o ganado e interés; una vez por cuenta o solicitud |
| commercial_authorized | Primera concesión efectiva de publicidad; una vez por cuenta o solicitud, independiente del canal y de revocaciones posteriores |
| installation_interest | Primera declaración o marca de interés en instalación; una vez por cuenta o solicitud |

No hay proveedor analítico externo. Los eventos públicos se envían sin cookies ni referente, solo después de una elección positiva. Aceptar y rechazar tienen controles equivalentes en el pie de la app, con opción de retirada. Solo se persiste la decisión local; no hay identificador de visitante ni cola offline. Los hitos de servicio se contabilizan a partir de hechos efectivos sin depender de la medición opcional de visitas, según la información de privacidad publicada.

Los contadores contienen fecha, evento, bucket y cantidad. `metric_milestones` es un marcador operativo para deduplicar por cuenta viewer/solicitud, excluyendo actividad de cuentas administrativas y operadoras; no es un historial de navegación ni contiene direcciones o campañas. Se elimina por cascada al suprimir el sujeto. El contador anónimo permanece; se limpia a los 400 días mediante mantenimiento de retención. Los errores de medición no impiden registrar, verificar o autorizar. El endpoint público incorpora un límite técnico con hash de IP, separado de métricas y con limpieza de seguridad.

## Informe administrativo

Administración → Captación y activación. Filtro de fechas (máximo 366 días). Se muestran:

- Conteos de los ocho eventos nuevos del período.
- Cohorte de cuentas viewer creadas en ese período, con estado actual de verificación, activación, perfil relevante, permiso vigente e instalación.
- Numerador, denominador y porcentaje explícitos, usando cuentas registradas del mismo período y canal. No se divide entre visitas de una muestra consentida ni se presenta una conversión secuencial ficticia.
- Por canal: cuentas verificadas, agrícolas completas verificadas, autorización vigente e instalación. Además, cruces de agrícolas verificadas autorizadas y agrícolas interesadas en instalación.

Las cuentas/sus solicitudes son unidades diferentes. No hay deduplicación anónima entre personas, navegadores o entre una solicitud y una cuenta creada por otra vía. La cohorte incluye cuentas preexistentes creadas dentro del período aunque sus eventos históricos no existan. Las cuentas borradas salen de la cohorte y pueden haber contribuido al contador agregado. La atribución usa el primer origen conservado de la cuenta; la activación administrativa de una solicitud conserva su campaña y perfil. No se considera verificada una solicitud por el mero hecho de enviarla.

## Contenidos de confianza

Metadatos por página pública, canonical y vista compartida coherentes. La imagen cuadrada existente usa Twitter summary. Sitemap basado en el catálogo de rutas efectivamente servidas, excluyendo panel, cuenta, administración y acceso con token. Rutas privadas con noindex. Páginas legales .html redirigen a su URL canónica. Se corrige la explicación de las dos vías de acceso y se mantiene explícita la simulación agrícola, sin testimonios o cifras de resultados inventados.

Privacidad y cookies describen solicitud, verificación, autorización por canal, seguimiento comercial, retención, métricas agregadas y elección opcional. La identificación completa del titular fiscal, domicilio y los detalles contractuales de proveedores/transferencias requieren datos reales del responsable: no se han inventado.

## Verificación

Pruebas de catálogo y rechazo de datos sensibles, denominadores vacíos, cruces agrícolas por canal, perfil relevante, consentimiento previo y retirada, envío sin credenciales/referrer, deduplicación en memoria, sitemap/metadatos y cierre de dependencias PWA. La suite general ejecutada obtuvo 226 pruebas correctas de 228; siguen los dos fallos previos en las expectativas textuales de cancelación de mensajes manuales (`consent.test.js`) y transacción de reglas (`pipeline.test.js`). Las 13 pruebas específicas de analítica, SEO y PWA pasan.

Se ejecutó `npm run migrate` correctamente y se comprobó `analyticsReport` con consultas de solo lectura sobre la base configurada: devuelve los ocho eventos y maneja correctamente una cohorte vacía con denominador cero. Se validaron además los INSERT de contador y deduplicación mediante EXPLAIN sin ANALYZE, sin ejecutar escrituras de eventos de prueba. No se ejecutaron campañas, correos ni WhatsApp a usuarios: las pruebas de entrega usan proveedores de consola y datos sintéticos. Quedan el despliegue de la aplicación y la revisión visual en navegador real.
