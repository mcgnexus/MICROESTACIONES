import test from 'node:test';
import assert from 'node:assert/strict';
import { connectivityFor, dataFreshnessFor, offlineThresholdSeconds } from './station-status.js';

test('connectivity uses transmit interval plus agreed grace', () => {
  const contact = new Date('2026-10-07T12:00:00Z');
  const now = (minutes) => new Date(contact.getTime() + minutes * 60_000);
  assert.equal(connectivityFor(contact, 900, now(15)), 'online');
  assert.equal(connectivityFor(contact, 900, now(27)), 'online');
  assert.equal(connectivityFor(contact, 900, now(28)), 'degraded');
  assert.equal(connectivityFor(contact, 900, now(56)), 'offline');
  assert.equal(offlineThresholdSeconds(900), 3000);
});

test('five-minute measurements remain fresh across a fifteen-minute transmit cadence', () => {
  const observed = new Date('2026-10-07T12:00:00Z');
  assert.equal(dataFreshnessFor(observed, 300, new Date(observed.getTime() + 15 * 60_000)), 'fresh');
  assert.equal(dataFreshnessFor(observed, 300, new Date(observed.getTime() + 21 * 60_000)), 'stale');
  assert.equal(connectivityFor(null, 900, observed), 'unknown');
});

test('a reading younger than twenty minutes is never labelled stale', () => {
  const observed = new Date('2026-10-07T12:00:00Z');
  // Aunque la configuración declare un intervalo muy corto, el envío real es
  // de ~15 min: el umbral de frescura tiene un suelo de 20 minutos.
  assert.equal(dataFreshnessFor(observed, 60, new Date(observed.getTime() + 15 * 60_000)), 'fresh');
  assert.equal(dataFreshnessFor(observed, 60, new Date(observed.getTime() + 19 * 60_000)), 'fresh');
  assert.equal(dataFreshnessFor(observed, 300, new Date(observed.getTime() + 20 * 60_000)), 'fresh');
  assert.equal(dataFreshnessFor(observed, 300, new Date(observed.getTime() + 20 * 60_000 + 1)), 'stale');
});
