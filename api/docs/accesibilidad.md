# Revisión de accesibilidad — web pública

Fecha: 2026-10-09
Objetivo: WCAG 2.2 AA. La revisión automática **no certifica** conformidad; requiere además pruebas manuales.

## Método

- Cálculo de contraste WCAG de cada declaración `color` del CSS frente a los fondos claros reales (`#ffffff`, `#edf4ee`, `#f3f5f0`, `#e9ede8`, `#f1f3f0`, `#f4f6f4`).
- Inspección de estructura (encabezados, landmarks, `lang`, etiquetas de formulario, `aria-live`).
- Revisión de foco, `prefers-reduced-motion` y alternativa textual de gráficas.

## Corregido

### Contraste de texto atenuado (AA exige 4.5:1)

Se sustituyeron los grises de texto secundario que quedaban por debajo del umbral por `#5f6f64`
(≥ 4.76:1 sobre los fondos claros usados):

| Selectores | Color previo | Ratio previo | Nuevo |
| --- | --- | --- | --- |
| `.updated`, `.metric span/small`, `.empty`, `.hint`, `.coverage`, `.footnote` | `#68766c`/`#78857b`/`#748178`/`#79867c` | 3.4–4.3 | `#5f6f64` |
| `.chart-title small`, `.chart-dates`, `.chart-trend-help`, `.chart-current small` | `#809087`/`#75867d`/`#718279` | 3.0–4.1 | `#5f6f64` |
| `.mobile-tab-bar a`, `.state-since`, `.reading-legend`, `.overview-updated`, `.upcoming-heading small` | varios | 3.4–4.2 | `#5f6f64` |
| `.weather-attribution a` | `#07869a` | 4.30 | `#0a6b7a` |
| `.aemet-readings .reading-source-head h3` | `#087c91` | 4.36 | `#06707f` |
| `.alert-level.warning` | `#936c22` | 4.26 | `#7a5a1c` |
| `.legend-amber` | `#a36a0d` | 4.06 | `#8a5a0b` |
| `.overview-tag.tone-muted`, `.trend-insuficiente`, `.row-deleted` | `#69756b`/`#737d75`/`#7d8a81` | 3.3–4.1 | `#5f6f64` |

### Botón «Cerrar» del diálogo (fallo grave)

`.dialog-head .quiet` usaba `#d6f0e7` (verde muy claro) sobre el fondo claro del diálogo
`#edf3f1`: **ratio 1.07**, prácticamente invisible. Corregido a `#1f6241` (6.49).

## Ya conforme

- `lang="es"`, `<header>/<main>/<footer>/<nav>` y enlace «Saltar al contenido».
- Foco visible: `:focus-visible { outline: 3px solid …; outline-offset: … }`; puntos de gráfica con `tabindex` y foco propio.
- Formularios con `<label>` envolvente; errores con `role="alert"`; cargas con `aria-live`.
- Gráficas con resumen textual (mín./máx./prom.) y `aria-label` por punto; `role="group"` con rango de fechas.
- `prefers-reduced-motion` respetado (incluido el indicador de carga).
- Estado nunca solo por color: insignias y tendencias llevan texto.

## Pendiente de verificación manual

- **360 px**: confirmar en dispositivo/navegador real que no hay desplazamiento horizontal de toda la página (las tablas usan `.table-wrap{overflow-x:auto}`).
- **Teclado**: recorrer la portada y los formularios con Tab; verificar orden lógico y foco visible.
- **Lector de pantalla**: comprobar el anuncio de los estados de carga y de la tabla de comparación.
- **Contraste de texto claro sobre fondo oscuro** (topbar, footer, hero, diálogo): los colores son claros sobre fondos oscuros; se verificaron por inspección, no por cálculo exhaustivo de cada combinación.

Referencia: W3C, WCAG 2.2.
