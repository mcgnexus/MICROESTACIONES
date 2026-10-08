import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_PAGES, SITEMAP_PATHS, publicMetadata, sitemapXml, siteOrigin } from './seo.js';
test('el sitemap contiene las páginas públicas servidas y excluye acceso y datos privados', () => {
  for (const path of Object.keys(PUBLIC_PAGES)) assert.ok(SITEMAP_PATHS.includes(path));
  for (const path of ['/entrar', '/panel', '/admin', '/cuenta', '/api/v1/me']) assert.ok(!SITEMAP_PATHS.includes(path));
  assert.match(sitemapXml('https://example.test'), /<loc>https:\/\/example.test\/demo-agricola<\/loc>/);
});
test('el dominio público elimina consultas y rechaza credenciales y protocolos ajenos a web', () => {
  assert.equal(siteOrigin('https://example.test/?token=secret'), 'https://example.test');
  assert.throws(() => siteOrigin('https://user:password@example.test'));
  assert.throws(() => siteOrigin('javascript:alert(1)'));
});
test('título, descripción, canonical y vista compartida corresponden a cada página pública', async () => {
  const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
  const rendered = publicMetadata(html.replaceAll('__SITE_URL__', 'https://example.test'), '/demo-agricola', 'https://example.test');
  assert.match(rendered, /<title>Demostración agrícola simulada \| TecRural<\/title>/);
  assert.match(rendered, /rel="canonical" href="https:\/\/example.test\/demo-agricola"/);
  assert.match(rendered, /property="og:url" content="https:\/\/example.test\/demo-agricola"/);
  assert.match(rendered, /name="twitter:title" content="Demostración agrícola simulada/);
  assert.match(rendered, /No son lecturas actuales ni resultados de clientes/);
});
