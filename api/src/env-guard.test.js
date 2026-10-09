import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWriteTarget, hostOf, productionHosts } from './env-guard.js';

test('fuera de producción la escritura se permite sin confirmación', () => {
  const target = evaluateWriteTarget({
    env: { DATABASE_URL: 'postgresql://u:p@localhost:5432/tecrural', NODE_ENV: 'development' },
    argv: ['node', 'migrate.js'],
  });
  assert.equal(target.production, false);
  assert.equal(target.allowed, true);
});

test('VERCEL_ENV=production bloquea aunque no haya lista de hosts', () => {
  const target = evaluateWriteTarget({
    env: { DATABASE_URL: 'postgresql://u:p@some.host/db', VERCEL_ENV: 'production' },
    argv: ['node', 'migrate.js'],
  });
  assert.equal(target.production, true);
  assert.equal(target.allowed, false);
});

test('un host de producción en la lista bloquea la escritura', () => {
  const target = evaluateWriteTarget({
    env: {
      DATABASE_URL: 'postgresql://u:p@ep-prod-pooler.neon.tech/neondb',
      PRODUCTION_DB_HOSTS: 'ep-prod-pooler.neon.tech, ep-prod.neon.tech',
    },
    argv: ['node', 'retention-cli.js'],
  });
  assert.equal(target.production, true);
  assert.equal(target.allowed, false);
});

test('--force permite la operación sobre producción', () => {
  const target = evaluateWriteTarget({
    env: { DATABASE_URL: 'postgresql://u:p@ep-prod.neon.tech/neondb', VERCEL_ENV: 'production' },
    argv: ['node', 'migrate.js', '--force'],
  });
  assert.equal(target.production, true);
  assert.equal(target.forced, true);
  assert.equal(target.allowed, true);
});

test('ALLOW_PRODUCTION_WRITES=true permite la operación sobre producción', () => {
  const target = evaluateWriteTarget({
    env: { DATABASE_URL: 'postgresql://u:p@ep-prod.neon.tech/neondb', VERCEL_ENV: 'production', ALLOW_PRODUCTION_WRITES: 'true' },
    argv: ['node', 'migrate.js'],
  });
  assert.equal(target.allowed, true);
});

test('una DATABASE_URL inválida no se clasifica como producción por sí sola', () => {
  const target = evaluateWriteTarget({
    env: { DATABASE_URL: 'no-es-una-url', NODE_ENV: 'test' },
    argv: ['node', 'migrate.js'],
  });
  assert.equal(target.host, null);
  assert.equal(target.production, false);
});

test('hostOf y productionHosts normalizan y toleran valores ausentes', () => {
  assert.equal(hostOf('postgresql://u:p@EP-Host.neon.tech/db'), 'ep-host.neon.tech');
  assert.equal(hostOf(''), null);
  assert.deepEqual(productionHosts({}), []);
  assert.deepEqual(productionHosts({ PRODUCTION_DB_HOSTS: ' A.com , b.com ' }), ['a.com', 'b.com']);
});
