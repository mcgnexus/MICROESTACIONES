import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('./server.js', import.meta.url), 'utf8');

// Cambio 8: la casilla de novedades se presenta en el registro por email, su
// elección viaja con el enlace (envío y reenvío) y se aplica al verificar. Un
// permiso retirado no se vuelve a conceder con un enlace antiguo.

test('el formulario de acceso ofrece novedades opcionales con su privacidad', () => {
  const form = view.slice(view.indexOf('id="magic-form"'), view.indexOf('</form>', view.indexOf('id="magic-form"')));
  assert.match(form, /<input type="checkbox" name="newsletter">/);
  // Desmarcada: la publicidad nunca va por defecto.
  assert.doesNotMatch(form, /name="newsletter"[^>]*checked/);
  assert.match(form, /novedades y ofertas por email/);
  // La información de privacidad está junto a la casilla.
  assert.match(form, /href="\/privacidad"/);
  // Y el acceso gratuito no depende de marcarla.
  assert.match(form, /no requiere casillas adicionales/);
});

test('la elección viaja al pedir el enlace y en cada reenvío', () => {
  const sends = app.match(/await api\('\/api\/auth\/magic\/request'[\s\S]*?\}\);/g) || [];
  assert.ok(sends.length >= 2, 'faltan el envío y el reenvío');
  for (const send of sends) {
    assert.match(send, /commercial_consent:/, 'un envío pierde la elección de novedades');
  }
  // La elección vive fuera del formulario oculto y se restaura al volver.
  assert.match(app, /let magicNewsletter = false/);
  assert.match(app, /magicNewsletter = \$\('#magic-form input\[name="newsletter"\]'\)\.checked/);
  assert.match(app, /commercial_consent: magicNewsletter/);
  assert.match(app, /\$\('#magic-form input\[name="newsletter"\]'\)\.checked = magicNewsletter/);
});

test('verificar el enlace aplica el permiso salvo que estuviera retirado', () => {
  // El registro comercial solo se escribe si el último hecho no es revocación.
  assert.match(server, /lastConsent\?\.action !== 'revoked'/);
  assert.match(server, /purpose = 'commercial' AND channel = 'email'/);
  assert.match(server, /ORDER BY recorded_at DESC, id DESC LIMIT 1/);
  // La consulta vive dentro de la transacción del libro de consentimientos.
  const verify = server.slice(server.indexOf("app.post('/api/auth/magic/verify'"), server.indexOf('markMetric(sql, \'contact_verified\''));
  assert.match(verify, /await tx`SELECT action FROM consent_records/);
});
