export const PUBLIC_PAGES = {
  '/': ['Tiempo local medido en Huéscar | TecRural', 'Consulta mediciones reales de temperatura y humedad en un punto del casco urbano de Huéscar, su evolución y su comparación temporal con AEMET.'],
  '/como-funciona': ['Cómo funciona la medición local | TecRural', 'Conoce qué miden las microestaciones y cómo se distinguen mediciones, previsiones y avisos orientativos.'],
  '/zonas': ['Puntos de medida y zonas | TecRural', 'Consulta puntos meteorológicos autorizados. Una estación representa su emplazamiento, no toda una zona.'],
  '/tiempo-local': ['Tiempo local en Huéscar | TecRural', 'Temperatura y humedad medidas en un punto del casco urbano, con hora de lectura y estado de actualización.'],
  '/comparacion-aemet': ['Mediciones locales y AEMET | TecRural', 'Compara observaciones dentro de una ventana temporal compatible; las fuentes se muestran por separado cuando no hay pareja.'],
  '/evolucion': ['Evolución de las mediciones | TecRural', 'Consulta la evolución reciente de temperatura y humedad con datos reales disponibles, sin interpolar mediciones ausentes.'],
  '/vias': ['Tres formas de empezar | TecRural', 'Ver la demostración simulada, entrar con tu correo o consultar una instalación: tres caminos distintos con resultados distintos.'],
  '/fincas': ['Medición meteorológica para fincas | TecRural', 'Explora la utilidad de medir en una finca y declara tu interés en una futura instalación, sin compromiso automático.'],
  '/herramientas': ['Herramientas agrícolas y acceso | TecRural', 'Herramientas para consultar y entender las mediciones de tus estaciones. Requieren entrar con tu correo y que el equipo conceda el acceso.'],
  '/demo-agricola': ['Simulación agrícola con datos inventados | TecRural', 'Explora escenarios simulados de frío, calor y diferencias entre puntos. No son lecturas actuales ni resultados de clientes: las mediciones reales están en la portada.'],
  '/preguntas': ['Preguntas sobre microestaciones | TecRural', 'Alcance de las mediciones, fuentes externas, avisos orientativos y acceso a TecRural.'],
  '/solicitar-piloto': ['Consultar una instalación | TecRural', 'Revisamos tu solicitud y te contactamos para estudiarla. No da acceso por sí solo ni programa una instalación automática.'],
};
export const SITEMAP_PATHS = [...Object.keys(PUBLIC_PAGES), '/privacidad', '/aviso-legal', '/cookies', '/contacto'];
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
export function siteOrigin(value) {
  const url = new URL(value || 'https://tecrural-microestacion.vercel.app');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_public_site_url');
  return url.origin;
}
export function publicMetadata(html, path, origin) {
  const [title, description] = PUBLIC_PAGES[path] || PUBLIC_PAGES['/'];
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta (?:name|property)="(?:og:title|twitter:title)" content=")[^"]*/g, `$1${escape(title)}`)
    .replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*/g, `$1${escape(description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${escape(origin + path)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${escape(origin + path)}`);
}
export function sitemapXml(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP_PATHS.map((path) => `  <url><loc>${escape(origin + path)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
