import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrate = readFileSync(new URL('../src/migrate.js', import.meta.url), 'utf8');

// La lectura pública y la comparación AEMET filtraan por validada y no borrada y
// ordenan por fecha: el índice debe cubrir esas mismas condiciones.
test('existe un índice parcial para la lectura más reciente y la ventana de 24 h', () => {
  assert.match(migrate,
    /CREATE INDEX IF NOT EXISTS measurements_latest_idx ON measurements\(device_id, observed_at DESC\) WHERE is_validated = true AND deleted_at IS NULL/);
  // Idempotente: IF NOT EXISTS para poder reejecutar la migración sin fallar.
  for (const match of migrate.matchAll(/CREATE INDEX IF NOT EXISTS measurements_\w+/g)) {
    assert.ok(match, 'toda creación de índice de measurements debe ser idempotente');
  }
});
