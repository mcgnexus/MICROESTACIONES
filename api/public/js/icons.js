// Conjunto de iconos de la aplicación.
//
// Casi todos son un solo trazo, un solo grosor y una sola rejilla de 24: así el
// reconocimiento no depende del estilo del glifo, que es lo que pasaba con los
// emojis (cada sistema operativo los dibuja distinto, a distinto tamaño y a
// distinto color) y con los símbolos geométricos de la navegación, que no se
// distinguían entre sí sin leer la etiqueta. Las excepciones son los tres
// iconos de lectura (estación, temperatura y humedad), que son rellenos con su
// propia rejilla y pintan heredando el color del texto.
//
// Todos son decorativos: quien los usa los marca con aria-hidden y el texto
// que los acompaña es el que se lee. `title` existe para quien los usa dentro
// de un control que solo tiene icono. Este módulo no importa de ui.js para no
// formar un ciclo: ui.js usa `icon`, y aquí solo se necesita escapar un
// atributo, que es lo único que hace falta de ese módulo.
const escapeText = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Rellena cualquier elemento `[data-icon="nombre"]` que exista en el HTML
// estático, donde no puede haber marcado generado por JavaScript. Se llama una
// vez al arrancar; los iconos que viven en plantillas los genera `icon`.
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    if (element.firstElementChild) return;
    element.innerHTML = icon(element.dataset.icon);
  });
}

// Iconos rellenos con su propia rejilla: dibujan con `fill` heredando el
// color del texto, sin trazo. El cuerpo va limpio de ids y estilos inline
// para no chocar con el resto del documento.
const ICONO_ESTACION = {
  filled: true, viewBox: '0 0 297 297',
  body: '<g><path d="M166.264,259C166.267,259,166.262,259,166.264,259c24.646,0,50.552-6.369,71.899-18.432 c2.737-1.547,4.594-4.283,5.019-7.398c0.425-3.115-0.631-6.25-2.855-8.473l-66.434-66.443c9.732-13.521,8.528-32.537-3.625-44.694 c-12.152-12.152-31.166-13.356-44.686-3.623L59.151,43.495c-2.223-2.224-5.358-3.279-8.474-2.854 c-3.115,0.425-5.854,2.282-7.399,5.02c-28.422,50.313-23.286,112.725,11.358,157.69l-40.393,79.091 c-1.559,3.118-1.392,6.822,0.441,9.788c1.833,2.966,5.071,4.771,8.558,4.771h132.963c5.556,0,10.06-4.504,10.06-10.06V259z M156.04,127.786c4.256,4.256,5.307,10.52,3.157,15.77l-18.919-18.923C145.527,122.482,151.788,123.532,156.04,127.786z M146.145,276.88H39.518l29.003-58.015c21.534,20.814,48.478,34.097,77.624,38.509V276.88z M167.859,238.887 c-0.002,0-0.006,0-0.008,0c-32.827-0.002-63.688-12.786-86.896-35.997c-35.689-35.695-45.609-89.648-26.126-135.261 l161.364,161.385C200.996,235.501,184.521,238.887,167.859,238.887z"/><path d="M153.607,73.852c31.08,0,56.366,25.289,56.367,56.375c0,5.556,4.505,10.06,10.06,10.06c5.557,0,10.061-4.505,10.061-10.06 c-0.001-42.18-34.313-76.495-76.487-76.495c-5.556,0-10.059,4.504-10.059,10.06C143.548,69.347,148.052,73.852,153.607,73.852z"/><path d="M153.607,0c-5.556,0-10.059,4.504-10.059,10.06c0,5.556,4.503,10.061,10.059,10.061 c60.704,0.001,110.091,49.394,110.091,110.106c0,5.555,4.504,10.06,10.06,10.06c5.556,0,10.061-4.505,10.061-10.06 C283.818,58.42,225.405,0.001,153.607,0z"/></g>',
};

const ICONO_TEMPERATURA = {
  filled: true, viewBox: '0 0 442.936 442.936',
  body: '<g><g><path d="M422.988,21.678C410.124,8.814,392.964,1.73,374.668,1.73c-18.296,0-35.456,7.084-48.316,19.948L135.84,212.186 c-0.364,0.364-0.724,0.732-1.084,1.112c-6.608-1.16-13.316-1.744-20.028-1.744c-30.652,0-59.448,11.916-81.08,33.548 C11.948,266.802,0,295.646,0,326.33c0,30.684,11.948,59.532,33.648,81.228c21.692,21.696,50.54,33.648,81.224,33.648 c30.688,0,59.536-11.952,81.232-33.648c25.14-25.14,37.104-60.328,32.764-95.384c1.26-1.084,2.468-2.2,3.604-3.34l190.516-190.516 c12.86-12.864,19.948-30.024,19.948-48.32C442.936,51.702,435.852,34.542,422.988,21.678z M406.02,101.338L215.5,291.858 c-1.86,1.864-3.944,3.572-6.364,5.232c-3.936,2.696-5.904,7.464-5.012,12.148c5.64,29.644-3.704,60.052-24.992,81.344 c-17.164,17.164-39.988,26.616-64.26,26.616c-24.272,0-47.088-9.452-64.252-26.616s-26.616-39.984-26.616-64.256 c0-24.268,9.452-47.088,26.616-64.256c17.1-17.1,39.864-26.516,64.108-26.516c7.32,0,14.64,0.88,21.744,2.612 c4.644,1.14,9.512-0.596,12.404-4.404c1.448-1.908,2.692-3.368,3.924-4.6l190.516-190.52c8.332-8.328,19.464-12.916,31.352-12.916 s23.02,4.588,31.352,12.916c8.328,8.332,12.92,19.464,12.92,31.348C418.94,81.874,414.348,93.006,406.02,101.338z"/></g><g><path d="M346.916,62.106l-22.012-22.012c-3.124-3.124-8.188-3.124-11.312,0c-3.124,3.124-3.124,8.188,0,11.312l22.012,22.012 c1.564,1.564,3.608,2.344,5.656,2.344c2.044,0,4.092-0.78,5.656-2.344C350.04,70.294,350.04,65.23,346.916,62.106z"/></g><g><path d="M303.468,87.942L290.26,74.734c-3.124-3.124-8.188-3.124-11.312,0c-3.124,3.124-3.124,8.188,0,11.312l13.208,13.208 c1.56,1.564,3.608,2.344,5.656,2.344c2.048,0,4.096-0.784,5.656-2.344C306.592,96.13,306.592,91.066,303.468,87.942z"/></g><g><path d="M277.632,131.382l-22.008-22.012c-3.124-3.124-8.188-3.12-11.312,0c-3.124,3.128-3.124,8.192,0,11.316l22.008,22.012 c1.56,1.564,3.608,2.344,5.656,2.344c2.048,0,4.096-0.784,5.656-2.344C280.756,139.57,280.756,134.506,277.632,131.382z"/></g><g><path d="M234.188,157.218l-13.204-13.208c-3.116-3.124-8.188-3.12-11.312,0c-3.124,3.124-3.124,8.192,0,11.316l13.204,13.208 c1.56,1.564,3.608,2.344,5.656,2.344c2.048,0,4.096-0.784,5.656-2.344C237.312,165.41,237.312,160.342,234.188,157.218z"/></g><g><path d="M208.356,200.662l-22.012-22.012c-3.124-3.124-8.188-3.124-11.312,0c-3.124,3.124-3.124,8.188,0,11.312l22.012,22.012 c1.564,1.564,3.608,2.344,5.656,2.344c2.048,0,4.096-0.78,5.656-2.344C211.48,208.85,211.48,203.786,208.356,200.662z"/></g><g><path d="M364.16,80.514c-4.688-4.688-12.28-4.688-16.968,0L142.456,285.246c-4.688,4.684-4.688,12.284,0,16.968 c2.344,2.344,5.412,3.516,8.484,3.516c3.068,0,6.14-1.172,8.484-3.516L364.16,97.482C368.848,92.798,368.848,85.198,364.16,80.514z"/></g><g><path d="M114.94,273.73c-28.672,0-52,23.324-52,52c0,28.676,23.328,52,52,52s52-23.324,52-52 C166.94,297.054,143.612,273.73,114.94,273.73z M114.94,361.73c-19.852,0-36-16.152-36-36c0-19.848,16.148-36,36-36 s36,16.152,36,36C150.94,345.578,134.792,361.73,114.94,361.73z"/></g></g>',
};

const ICONO_HUMEDAD = {
  filled: true, viewBox: '0 0 512 512',
  body: '<g><g><path d="M344.864,112.832c-26.176-33.408-53.248-67.904-75.072-104.96C266.912,3.008,261.664,0,256,0s-10.912,3.008-13.76,7.872 c-21.824,37.024-48.896,71.552-75.072,104.928C114.112,180.448,64,244.352,64,320c0,105.888,86.112,192,192,192 s192-86.112,192-192C448,244.384,397.92,180.48,344.864,112.832z M256,480c-88.224,0-160-71.776-160-160 c0-64.608,46.784-124.256,96.352-187.456c21.632-27.584,43.84-55.904,63.648-86.24c19.808,30.336,42.016,58.688,63.648,86.272 C369.216,195.744,416,255.424,416,320C416,408.224,344.224,480,256,480z"/></g><g><path d="M208,192c-26.464,0-48,21.536-48,48s21.536,48,48,48s48-21.536,48-48S234.464,192,208,192z M208,256 c-8.832,0-16-7.168-16-16c0-8.832,7.168-16,16-16c8.832,0,16,7.168,16,16C224,248.832,216.832,256,208,256z"/></g><g><path d="M304,352c-26.464,0-48,21.536-48,48s21.536,48,48,48s48-21.536,48-48S330.464,352,304,352z M304,416c-8.8,0-16-7.2-16-16 s7.2-16,16-16s16,7.2,16,16S312.8,416,304,416z"/></g><g><path d="M347.296,228.704c-6.24-6.24-16.384-6.24-22.624,0l-160,160c-6.24,6.24-6.24,16.384,0,22.624 C167.808,414.432,171.904,416,176,416s8.192-1.568,11.296-4.672l160-160C353.536,245.088,353.536,234.944,347.296,228.704z"/></g></g>',
};

// Trazo de 1,8 sobre rejilla de 24: el mismo grosor en todo el sistema.
const PATHS = {
  panel: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h11V10"/>',
  stations: ICONO_ESTACION,
  alerts: '<path d="M12 4.5 4 19.5h16z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  account: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/>',
  support: '<path d="M5 12a7 7 0 0 1 14 0"/><rect x="3" y="11" width="4" height="6" rx="2"/><rect x="17" y="11" width="4" height="6" rx="2"/><path d="M19 17c0 1.7-1.3 3-3 3h-1.5"/>',

  temperature: ICONO_TEMPERATURA,
  humidity: ICONO_HUMEDAD,
  pressure: '<path d="M4 12h3.2l1.8-4.6L11.8 17l2.1-6.6 1.6 3.2h4"/>',
  battery: '<rect x="3" y="7.5" width="15" height="9" rx="2.2"/><path d="M20.5 11v2"/><path d="M6.5 12h4"/>',
  lux: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',

  rain: '<path d="M7 14.5a4.2 4.2 0 0 1 .5-8.4 5.6 5.6 0 0 1 10.6 1.4 3.6 3.6 0 0 1-.6 7Z"/><path d="M9 18l-.8 2.2M13 18l-.8 2.2M17 18l-.8 2.2"/>',
  wind: '<path d="M3.5 9h9a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3.5 13h12.5a2.6 2.6 0 1 1-2.6 2.6"/>',
  cloud: '<path d="M7 18.5a4.2 4.2 0 0 1 .5-8.4 5.6 5.6 0 0 1 10.6 1.4 3.6 3.6 0 0 1-.6 7Z"/>',
  storm: '<path d="M7 14.5a4.2 4.2 0 0 1 .5-8.4 5.6 5.6 0 0 1 10.6 1.4 3.6 3.6 0 0 1-.6 7Z"/><path d="m12.8 13.2-2.6 4h3l-1 3.4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.2 8.8-1.6 4.8-4.8 1.6 1.6-4.8Z"/>',
  station: ICONO_ESTACION,

  frost: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 7.2 10 5.4M12 7.2l2-1.8M12 16.8l-2 1.8M12 16.8l2 1.8"/>',
  heat: '<circle cx="12" cy="10.5" r="3.6"/><path d="M12 3.2v1.8M12 16v1.8M5.6 10.5H3.8M20.2 10.5h-1.8M7.4 5.9 6.1 4.6M16.6 5.9l1.3-1.3M7.4 15.1l-1.3 1.3M16.6 15.1l1.3 1.3"/>',
  connectivity: '<path d="M6 17.5a8.5 8.5 0 0 1 12 0"/><path d="M9 14.4a5 5 0 0 1 6 0"/><circle cx="12" cy="17.8" r="1.4"/>',
  install: '<rect x="6" y="3" width="12" height="18" rx="2.4"/><path d="M12 8v5M9.8 11l2.2 2.2 2.2-2.2"/>',

  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v4.2h-4.2"/>',
  chart: '<path d="M4 19.5V4.5"/><path d="M4 19.5h16"/><path d="m6.5 15 3.5-4.5 3 2.5 4.5-6"/>',
  difference: '<path d="M7.5 4.5v15M16.5 4.5v15"/><path d="m4.8 7 2.7 3-2.7 3M19.2 7l-2.7 3 2.7 3"/>',
};

export const ICON_NAMES = Object.keys(PATHS);

/**
 * Icono en línea. `size` es el lado en píxeles; el resto del tamaño lo hereda
 * el contenedor, de modo que el icono nunca se desincroniza de su texto.
 * Las entradas de trazo usan la rejilla de 24; las rellenas traen su propia
 * rejilla y pintan con `fill` heredando el color del texto.
 */
export function icon(name, { size = 20, title = null, className = '' } = {}) {
  const entry = PATHS[name];
  if (!entry) return '';
  const filled = typeof entry !== 'string';
  const body = filled ? entry.body : entry;
  const viewBox = filled ? entry.viewBox : '0 0 24 24';
  const paint = filled
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const accessibility = title
    ? `role="img" aria-label="${escapeText(title)}"`
    : 'aria-hidden="true"';
  return `<svg class="icon${className ? ` ${className}` : ''}" ${accessibility} focusable="false"
    viewBox="${viewBox}" width="${size}" height="${size}" ${paint}>${body}</svg>`;
}

// Icono + etiqueta en una sola pieza: el texto siempre acompaña al dibujo.
export function iconLabel(name, text, options = {}) {
  return `<span class="icon-label">${icon(name, options)}<span>${escapeText(text)}</span></span>`;
}