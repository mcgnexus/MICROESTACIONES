// Build del frontal: minifica el shell y firma el JS con hash de contenido,
// para poder servirlo con caché inmutable sin riesgo de versiones mezcladas.
// Genera public/dist/:
//   dist/assets/app-<hash>.js  (+ chunks de los import() dinámicos)
//   dist/index.html            (JS referenciado con hash, CSS incrustado;
//                               conserva los marcadores __SITE_URL__)
// Sin dist (desarrollo), el servidor sirve public/ tal cual.
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const rootDir = fileURLToPath(new URL('./', import.meta.url));
const distDir = join(publicDir, 'dist');
const assetsDir = join(distDir, 'assets');

await rm(distDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

// JS: bundle con code-splitting. Los import() dinámicos de cada sección del
// panel se convierten en chunks con hash que el navegador descarga al abrirlos.
const js = await build({
  entryPoints: [join(publicDir, 'app.js')],
  outdir: assetsDir,
  entryNames: 'app-[hash]',
  chunkNames: 'chunk-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2022'],
  minify: true,
  metafile: true,
  logLevel: 'info',
});

const entryOutput = Object.entries(js.metafile.outputs)
  .find(([, meta]) => meta.entryPoint && meta.entryPoint.replaceAll('\\', '/').endsWith('/app.js'));
if (!entryOutput) throw new Error('No se encontró el bundle de entrada app.js');
const jsUrl = `/dist/assets/${entryOutput[0].split('/').pop()}`;

// Los chunks que el entry importa de forma estática se conocen solo al parsear
// app.js: sin aviso previo el navegador los descubre tarde y encadena una ida y
// vuelta por chunk. Se anuncian con `modulepreload` para que se descarguen en
// paralelo con el entry.
const preloaded = [jsUrl, ...(entryOutput[1].imports || [])
  .filter((imp) => !imp.external && imp.kind === 'import-statement')
  .map((imp) => `/dist/assets/${imp.path.split('/').pop()}`)];
const preloadLinks = [...new Set(preloaded)]
  .map((href) => `<link rel="modulepreload" href="${href}">`)
  .join('\n  ');

// CSS: minificado e incrustado en el HTML en lugar de servirse como hoja aparte.
// Quita la hoja que bloqueaba el render y garantiza que la tarjeta SSR —dibujada
// con estas mismas reglas— aparezca ya maquetada en el primer pintado. Las
// páginas estáticas (privacidad, cookies, 404…) siguen usando /app.css fuente.
const cssSource = await readFile(join(publicDir, 'app.css'), 'utf8');
const cssBuild = await build({
  stdin: { contents: cssSource, loader: 'css', resolveDir: publicDir },
  minify: true,
  write: false,
});
const cssMin = cssBuild.outputFiles[0].text;

// HTML: reescribe el shell, incrusta el CSS y anuncia los assets del entry. El
// fuente vive en views/; el resultado va a public/dist para que el servidor
// sirva el HTML con el JS firmado y el JS con sus chunks anunciados.
const html = await readFile(join(rootDir, 'views', 'index.html'), 'utf8');
const CSS_LINK = '<link rel="stylesheet" href="/app.css">';
if (!html.includes(CSS_LINK)) throw new Error('No se encontró la hoja de estilos en index.html');
const rewritten = html
  .replace(CSS_LINK, `<style>${cssMin}</style>`)
  .replace('src="/app.js"', `src="${jsUrl}"`)
  .replace('</head>', `  ${preloadLinks}\n</head>`);
if (rewritten === html) throw new Error('No se han reescrito las referencias de index.html');
await writeFile(join(distDir, 'index.html'), rewritten);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const totalJs = Object.values(js.metafile.outputs).reduce((sum, meta) => sum + meta.bytes, 0);
console.log(`build: ${jsUrl} + ${Object.keys(js.metafile.outputs).length - 1} chunk(s) · JS ${kb(totalJs)} · CSS inline ${kb(cssMin.length)}`);
