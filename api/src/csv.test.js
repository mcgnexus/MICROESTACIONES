import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from './csv.js';

test('CSV escapa delimitadores y comillas', () => {
  assert.equal(csvCell('estación, "norte"'), '"estación, ""norte"""');
});

test('CSV neutraliza fórmulas incluso tras espacios y controles iniciales', () => {
  for (const value of ['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)', '\t=1+1', '\uFEFF=1+1']) {
    assert.equal(csvCell(value), `'${value}`);
  }
});

test('CSV conserva números y valores textuales ordinarios', () => {
  assert.equal(csvCell(-12.5), '-12.5');
  assert.equal(csvCell('esp32c3-01'), 'esp32c3-01');
  assert.equal(csvCell(null), '');
});
