// Build del frontal: minifica el shell y firma los assets con hash de
// contenido, para poder servirlos con caché inmutable sin riesgo de
// versiones mezcladas. Genera public/dist/:
//   dist/assets/app-<hash>.js  (+ chunks de los import() dinámicos)
//   dist/assets/app-<hash>.css
//   dist/index.html            (referencias reescritas; conserva los
//                               marcadores __SITE_URL__ para el servidor)
// Sin dist (desarrollo), el servidor sirve public/ tal cual.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
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

// CSS: minificado y firmado con el hash de su contenido minificado.
const cssSource = await readFile(join(publicDir, 'app.css'), 'utf8');
const cssBuild = await build({
  stdin: { contents: cssSource, loader: 'css', resolveDir: publicDir },
  minify: true,
  write: false,
});
const cssMin = cssBuild.outputFiles[0].text;
const cssHash = createHash('sha1').update(cssMin).digest('hex').slice(0, 12);
const cssUrl = `/dist/assets/app-${cssHash}.css`;
await writeFile(join(assetsDir, cssUrl.split('/').pop()), cssMin);

// HTML: reescribe las referencias del shell a los assets firmados. El fuente
// vive en views/; el resultado va a public/dist para que el servidor (y el
// estático de Vercel, si lo alcanza) sirvan las URLs con hash.
const html = await readFile(join(rootDir, 'views', 'index.html'), 'utf8');
const rewritten = html
  .replace('href="/app.css"', `href="${cssUrl}"`)
  .replace('src="/app.js"', `src="${jsUrl}"`);
if (rewritten === html) throw new Error('No se han reescrito las referencias de index.html');
await writeFile(join(distDir, 'index.html'), rewritten);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const totalJs = Object.values(js.metafile.outputs).reduce((sum, meta) => sum + meta.bytes, 0);
console.log(`build: ${jsUrl} + ${Object.keys(js.metafile.outputs).length - 1} chunk(s) · JS ${kb(totalJs)} · CSS ${kb(cssMin.length)} → ${cssUrl}`);
