# Pantallas mínimas y su acabado — TecRural Microestación

Fecha: 2026-10-09
Estado: especificación previa a conectar con producción
Objetivo de accesibilidad: WCAG 2.2 AA (revisión automática + pruebas manuales; una puntuación automática no certifica conformidad).

## 1. Estructura de la portada (orden)

1. **Temperatura y humedad reales** del punto público (primero, sin scroll).
2. **Ubicación pública, hora de medición y estado de actualización.**
3. **Evolución de 24 horas.**
4. **Acceso al histórico gratuito.**
5. **Explicación breve del servicio en finca** + CTA de solicitud.
6. **Comparación AEMET** en su propio bloque (no domina la portada).
7. Explicación del servicio y preguntas frecuentes.

## 2. Navegación móvil corta

Barra inferior con **tres destinos** (no una fila de ocho):

| Destino | Etiqueta | Función |
| --- | --- | --- |
| Tiempo local | Tiempo | Portada pública |
| Mi cuenta o mi finca | Cuenta / Finca | Histórico, favoritos, emplazamiento |
| Acceso | Acceso | Registro o entrada |

La solicitud de servicio se encuentra desde la portada y desde «mi finca», sin tapar la consulta del tiempo.

## 3. Pantallas

### 3.1 Tiempo local

| Bloque | Contenido imprescindible |
| --- | --- |
| Lectura actual | Temperatura y humedad con unidad visible; hora de medición; estado (reciente/antiguo/sin conexión) |
| Contexto | Zona, estación y frase «un emplazamiento concreto, no toda la ciudad» |
| Evolución | Gráfica de 24 h con resumen textual y tabla accesible alternativa |

### 3.2 Comparación AEMET

| Bloque | Contenido imprescindible |
| --- | --- |
| Última pareja válida | Valor local, valor AEMET, diferencia emparejada (±10 min) |
| Fuentes y horas | Estación AEMET, hora de cada dato, frescura |
| Ubicación de cada estación | Distancia entre emplazamientos, altitud y fuente de cada coordenada |
| Previsión/avisos | Etiquetados como externos; nunca como medición local |

### 3.3 Acceso gratuito

| Bloque | Contenido imprescindible |
| --- | --- |
| Correo | Campo único; sin contraseña ni perfil completo |
| Beneficio concreto | «Histórico de 7 días y favoritos» |
| Estado de envío | Confirmación, caducidad del enlace y aviso de comunicación necesaria |
| Vuelta a la función | Conserva la herramienta solicitada (`next`) |

### 3.4 Cuenta gratuita

| Bloque | Contenido imprescindible |
| --- | --- |
| Histórico disponible | 7 días, con rango visible |
| Favoritos | Estaciones públicas marcadas |
| Gestión de cuenta | Rol, plan, correo verificado, contacto y baja |

### 3.5 Servicio en tu emplazamiento

| Bloque | Contenido imprescindible |
| --- | --- |
| Qué incluye | Estación asignada, 90 días iniciales, avisos tras pruebas |
| Propiedad del equipo | La estación es de TecRural; el cliente contrata el servicio |
| Solicitud breve | Nombre, teléfono, localidad, finca o casa de campo e interés (opcional) |
| Condiciones | Precio hipótesis marcado como no definitivo; condiciones a precisar |

### 3.6 Mi finca o casa de campo

| Bloque | Contenido imprescindible |
| --- | --- |
| Estación asignada | Nombre, ubicación y estado de instalación |
| Mediciones | Última lectura y evolución |
| Histórico | Hasta 90 días |
| Estado | Conectividad, batería (sin porcentaje calculado) y frescura |

### 3.7 Avisos

| Bloque | Contenido imprescindible |
| --- | --- |
| Episodios locales | Regla, valor, hora de la medida y antigüedad |
| Información oficial | Avisos AEMET, separados visual y textualmente |
| Estado del motor | Si no está verificado, no se presentan como operativos |

### 3.8 Administración

| Bloque | Contenido imprescindible |
| --- | --- |
| Solicitudes | Bandeja de interesados con estado |
| Estaciones | Dispositivos, configuración y estado |
| Entregas | Cola, intentos y errores |
| Mantenimiento | Tareas periódicas, diagnóstico y retención |

### 3.9 Confianza

| Bloque | Contenido imprescindible |
| --- | --- |
| Contacto | Teléfono/WhatsApp de soporte |
| Legal | Privacidad, condiciones, cookies y aviso legal |
| Titular | Identificación fiscal y datos contractuales (pendiente) |

## 4. Matriz de estados por pantalla

Estados exigidos: **carga, sin datos, datos antiguos, error, sin permisos, éxito.**

| Pantalla | Carga | Sin datos | Datos antiguos | Error | Sin permisos | Éxito |
| --- | --- | --- | --- | --- | --- | --- |
| Tiempo local | «Cargando mediciones…» | «No hay medición urbana pública ahora» | «Última medición …» + etiqueta | «No se pudo cargar» + reintentar | No aplica (pública) | Lectura + evolución |
| Comparación AEMET | «Cargando observaciones…» | «Sin observación AEMET» | «Respuesta antigua (N min)» | «Consulta no disponible» | No aplica | Pareja válida + diferencia |
| Acceso gratuito | Botón «Enviando…» | No aplica | No aplica | «No se pudo enviar; usa atención manual» | No aplica | «Enlace enviado; caduca en 15 min» |
| Cuenta gratuita | «Cargando tu cuenta…» | «Aún sin histórico» | Rango con aviso | «No se pudo cargar la cuenta» | «Inicia sesión» | Histórico + favoritos |
| Servicio en tu emplazamiento | «Cargando…» | «Solicitud sin tramitar» | No aplica | «No se pudo enviar la solicitud» | No aplica | «Solicitud recibida» |
| Mi finca | «Cargando tu finca…» | «Estación aún sin datos» | «Última lectura …» | «No se pudo cargar» | «Sin estación asignada» | Estación + mediciones |
| Avisos | «Cargando avisos…» | «Sin avisos» | «Aviso de hace N» | «No se pudieron cargar» | «Sin acceso a avisos» | Episodios + oficiales |
| Administración | «Cargando…» | «Sin solicitudes» | No aplica | «No se pudo cargar» | «No autorizado» | Bandeja + estado |
| Confianza | Estático | No aplica | No aplica | No aplica | No aplica | Contenido legal |

## 5. Acabado visual y de interacción

- Tipografía legible; tamaños mínimos de cuerpo ≥ 16 px.
- Colores coherentes con contraste suficiente (≥ 4.5:1 texto normal).
- Unidades siempre visibles (°C, %, hPa, mV, lux).
- Botones con texto comprensible, no solo iconos.
- Mostrar únicamente funciones disponibles.
- Estados nunca solo por color: siempre texto o icono con etiqueta.
- Gráficas con resumen textual o tabla accesible alternativa.

## 6. Datos sensibles en la interfaz

| Regla | Motivo |
| --- | --- |
| No mostrar porcentaje de batería calculado | Falta caracterización del sistema |
| Presión en detalle técnico | No es argumento principal de captación |
| Aclarar si la presión es medida o reducida al nivel del mar | Evitar ambigüedad |
| Demostraciones identificadas como simulación | No comparten datos ni reglas con avisos reales |

## 7. Validación de accesibilidad (WCAG 2.2 AA)

| Criterio | Cómo se comprueba |
| --- | --- |
| 360 px de ancho | Sin desplazamiento horizontal de toda la página |
| Navegación por teclado | Foco visible, orden lógico, enlace «Saltar al contenido» |
| Contraste suficiente | Revisión automática + comprobación manual |
| Gráfica accesible | Acompañada de resumen textual o tabla |
| Revisión | Automática + pruebas manuales; la puntuación automática no certifica conformidad |

Referencia: W3C, WCAG 2.2 (https://www.w3.org/TR/WCAG22/).
