import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, preferenceColumns, preferenceSchema } from './alert-preferences.js';

test('default preferences receive everything by both channels', () => {
  assert.equal(DEFAULT_PREFERENCES.receiveFrost, true);
  assert.equal(DEFAULT_PREFERENCES.channelWhatsapp, true);
  assert.equal(DEFAULT_PREFERENCES.quietStart, null);
  assert.deepEqual(DEFAULT_PREFERENCES.customThresholds, {});
});

test('preference columns keep explicit values, including nulls, and drop undefined', () => {
  const patch = preferenceSchema.parse({ receive_frost: false, quiet_start: null, quiet_end: null, zone: 'Huéscar' });
  const columns = preferenceColumns(patch);
  assert.equal(columns.receive_frost, false);
  assert.equal(columns.quiet_start, null);
  assert.equal(columns.zone, 'Huéscar');
  assert.equal('receive_heat' in columns, false);
});
