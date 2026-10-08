# Fases 10 y 11: interesados y uso desde el campo

## Puesta en servicio

Ejecutar `npm run migrate` desde `api` para crear `prospect_tracking` antes de abrir Administración. Las cuentas y solicitudes existentes se muestran en la nueva bandeja sin convertir un registro en petición de llamada. El seguimiento comercial se guarda separado del estado de acceso o activación de la cuenta.

## Bandeja

Administración → Bandeja de interesados. Combina municipio (búsqueda parcial), actividad, interés, estado comercial, verificación de correo, permiso comercial e interés en instalación. Abrir un contacto permite editar notas, siguiente acción, fechas e instalación. Los estados son registrado, interés declarado, contacto solicitado, contactado y archivado.

La verificación indicada corresponde al correo de una cuenta; una solicitud pública no acredita verificación del teléfono. El origen muestra la captación registrada. Las exportaciones aplican los filtros vigentes, requieren elegir correo o WhatsApp y excluyen direcciones sin autorización vigente para ese canal, cuentas inactivas, archivados y retención vencida. Se deduplican direcciones y se neutralizan fórmulas CSV.

Baja comercial revoca los dos canales y cancela comunicaciones comerciales pendientes. Suprimir elimina el contacto y, en cuentas no administrativas, su cuenta y dependencias; elimina también la cola y auditoría asociadas. Las cuentas administrativas están protegidas.

La retención de una solicitud permite fijar su fecha de supresión. En una cuenta, el plazo comercial revoca publicidad, archiva y limpia notas y próximas acciones, conservando el acceso. El botón de retención ejecuta el mantenimiento existente; no despacha mensajes.

## PWA y móvil

El shell v2 incluye todos los módulos importados. No se cachean API, credenciales, consultas con parámetros ni páginas legales. Las páginas legales nunca reemplazan `index.html`. No hay persistencia local de datos privados. Si una vista conserva lecturas en memoria al perder conexión, un aviso persistente indica que son anteriores; la lectura principal aporta su hora. El inicio sin conexión no recupera datos privados de visitas anteriores.

Se notifican fallos de registro/actualización del service worker. Formularios y botones tienen tamaño táctil, foco visible, campos de tamaño legible y disposición de una columna en pantallas pequeñas. Se mantienen las alternativas textuales de los gráficos existentes.

## Verificación

`node --test src/prospect-policy.test.js src/pwa.test.js src/csv.test.js src/leads.test.js src/ui.test.js`: 30 pruebas correctas. Incluye autorización por canal, alcance combinado, retención vencida, fórmulas CSV, cierre completo de imports de frontend y exclusión de API/páginas legales del service worker.

La suite general observada tiene dos fallos ajenos a estas incorporaciones: una expectativa antigua que omite `manual` al cancelar por baja y una comprobación textual de `sql.begin` en el motor. No se ejecutaron migraciones sobre la base configurada ni pruebas visuales en un navegador o dispositivo real. Estas comprobaciones de despliegue y móvil quedan pendientes. Las pruebas usan datos sintéticos y proveedores de consola, sin campañas ni comunicaciones a usuarios.
