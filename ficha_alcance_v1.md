# Ficha de alcance — TecRural Microestación (v1)

Fecha: 2026-10-09
Estado: propuesta de producto pendiente de validación con pilotos

## Objetivo

Validar que el dato local de temperatura y humedad interesa, que existe motivo para registrarse y que alguien paga por consultar su propio emplazamiento.

## Límites de consulta (configurables)

| Acceso | Histórico | Notas |
| --- | --- | --- |
| Visitante sin cuenta | 24 h | Solo estación pública |
| Cuenta gratuita | 7 días | Favoritos de estaciones públicas cuando existan varias |
| Servicio en finca/casa | 90 días | Estación asignada al emplazamiento |

Estos límites se configuran por código y se validarán con los pilotos. No implican borrado de datos originales.

## Funciones incluidas

### Visitante sin cuenta
- Temperatura y humedad del punto público
- Hora del dato y estado (actual/antiguo)
- Evolución de 24 horas
- Última comparación válida con AEMET
- Explicación del servicio

### Cuenta gratuita
- Todo lo anterior
- Histórico de 7 días
- Favoritos de estaciones públicas
- Acceso sencillo desde PWA instalada

### Servicio en finca o casa de campo
- Estación asignada al emplazamiento (propiedad de TecRural)
- Histórico inicial de 90 días
- Avisos locales (solo tras superar pruebas de validación)
- Registro de instalación, ubicación, mantenimiento y retirada

## Funciones aplazadas

- Diagnóstico de plantas por IA
- Automatización y recomendaciones de riego
- Cuaderno agrícola
- Mapa de microclimas interpolados
- Tienda de hardware
- Múltiples planes profesionales
- Aplicaciones nativas (solo PWA)
- Cobro automático
- Medición de lluvia, viento y humedad del suelo (sensores actuales no lo acreditan)
- Previsión externa como medición local

## Condiciones comerciales

Precio hipótesis: 100 €/mes (sin validar). Antes de oferta definitiva precisar:
- Impuestos
- Instalación
- Mantenimiento
- Conectividad
- Duración mínima
- Baja y retirada de equipos

Cada piloto conservará el precio y condiciones realmente acordados.

## Criterio de éxito

Cinco personas del público objetivo explican qué obtienen gratis, qué ganan al registrarse y qué contratan con una estación. Objetivo: ≥ 4 lo entienden sin ayuda.
