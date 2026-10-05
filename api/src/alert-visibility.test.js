import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewAlert, isCommunicationAlert } from './alert-visibility.js';

test('communication alerts are visible only to admins', () => {
  const outage = { message: 'Estación sin comunicación', ruleSnapshot: { metric: 'connectivity' } };
  assert.equal(isCommunicationAlert(outage), true);
  assert.equal(canViewAlert('admin', outage), true);
  assert.equal(canViewAlert('operator', outage), false);
  assert.equal(canViewAlert('viewer', outage), false);
});

test('communication wording is recognized without accents and ordinary alerts remain visible', () => {
  assert.equal(isCommunicationAlert({ message: 'Problema de comunicacion WiFi' }), true);
  const weather = { message: 'Temperatura elevada', ruleSnapshot: { metric: 'temperature' } };
  assert.equal(isCommunicationAlert(weather), false);
  assert.equal(canViewAlert('operator', weather), true);
});
