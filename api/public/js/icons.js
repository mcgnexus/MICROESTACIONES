// Conjunto de iconos de la aplicación.
//
// Un solo trazo, un solo grosor y una sola rejilla de 24 para todos: así el
// reconocimiento no depende del estilo del glifo, que es lo que pasaba con los
// emojis (cada sistema operativo los dibuja distinto, a distinto tamaño y a
// distinto color) y con los símbolos geométricos de la navegación, que no se
// distinguían entre sí sin leer la etiqueta.
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

// Trazo de 1,8 sobre rejilla de 24: el mismo grosor en todo el sistema.
const PATHS = {
  panel: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h11V10"/>',
  stations: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21"/>',
  alerts: '<path d="M12 4.5 4 19.5h16z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  account: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/>',
  support: '<path d="M5 12a7 7 0 0 1 14 0"/><rect x="3" y="11" width="4" height="6" rx="2"/><rect x="17" y="11" width="4" height="6" rx="2"/><path d="M19 17c0 1.7-1.3 3-3 3h-1.5"/>',

  temperature: '<path d="M10 13.6V5.8a2 2 0 1 1 4 0v7.8a4.2 4.2 0 1 1-4 0Z"/><circle cx="12" cy="17.4" r="1.6"/>',
  humidity: '<path d="M12 3.5s5.5 6 5.5 9.7a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5Z"/>',
  pressure: '<path d="M4 12h3.2l1.8-4.6L11.8 17l2.1-6.6 1.6 3.2h4"/>',
  battery: '<rect x="3" y="7.5" width="15" height="9" rx="2.2"/><path d="M20.5 11v2"/><path d="M6.5 12h4"/>',
  lux: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',

  rain: '<path d="M7 14.5a4.2 4.2 0 0 1 .5-8.4 5.6 5.6 0 0 1 10.6 1.4 3.6 3.6 0 0 1-.6 7Z"/><path d="M9 18l-.8 2.2M13 18l-.8 2.2M17 18l-.8 2.2"/>',
  wind: '<path d="M3.5 9h9a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3.5 13h12.5a2.6 2.6 0 1 1-2.6 2.6"/>',
  cloud: '<path d="M7 18.5a4.2 4.2 0 0 1 .5-8.4 5.6 5.6 0 0 1 10.6 1.4 3.6 3.6 0 0 1-.6 7Z"/>',
  storm: '<path d="M7 14.5a4.2 4.2 0 0 1 .5-8.4 5.6 5.6 0 0 1 10.6 1.4 3.6 3.6 0 0 1-.6 7Z"/><path d="m12.8 13.2-2.6 4h3l-1 3.4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.2 8.8-1.6 4.8-4.8 1.6 1.6-4.8Z"/>',
  station: '<path d="M12 20v-6.5"/><path d="M8.5 4.5a5 5 0 0 0 0 7M15.5 4.5a5 5 0 0 1 0 7"/><circle cx="12" cy="17" r="1.8"/>',

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
 */
export function icon(name, { size = 20, title = null, className = '' } = {}) {
  const path = PATHS[name];
  if (!path) return '';
  const accessibility = title
    ? `role="img" aria-label="${escapeText(title)}"`
    : 'aria-hidden="true"';
  return `<svg class="icon${className ? ` ${className}` : ''}" ${accessibility} focusable="false"
    viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// Icono + etiqueta en una sola pieza: el texto siempre acompaña al dibujo.
export function iconLabel(name, text, options = {}) {
  return `<span class="icon-label">${icon(name, options)}<span>${escapeText(text)}</span></span>`;
}