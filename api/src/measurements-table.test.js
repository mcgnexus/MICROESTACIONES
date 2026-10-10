import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/measurements.js', import.meta.url), 'utf8');

// F21 · P2: la tabla de mediciones abría con 1.319 filas en 132 páginas y doce
// columnas que alejaban temperatura/humedad de la primera vista móvil. Ahora se
// abre por defecto en las últimas 24 horas, con columnas Hora/Temperatura/
// Humedad/Estado; la presión y el resto de telemetría se muestran bajo petición.

test('el periodo por defecto es un día (últimas 24 horas), no un mes', () => {
  assert.match(source, /<option value="day" selected>/);
  assert.doesNotMatch(source, /<option value="month" selected>/);
});

test('la cabecera reducida muestra Hora, Temperatura, Humedad y Estado, sin telemetría', () => {
  const header = source.slice(source.indexOf('<thead>'), source.indexOf('</thead>'));
  for (const keep of ['Hora', 'Temp.', 'Humedad', 'Estado']) {
    assert.match(header, new RegExp(`<th>${keep}</th>`), `la cabecera debe incluir ${keep}`);
  }
  for (const drop of ['Recibido', 'Sec.', 'Batería', 'Lux', 'Origen', 'Alerta']) {
    assert.doesNotMatch(header, new RegExp(`<th>${drop}</th>`), `la cabecera no debe incluir ${drop}`);
  }
});

test('la presión tiene un selector propio y su columna se oculta por defecto', () => {
  assert.match(source, /data-filter="pressure"/);
  assert.match(source, /Mostrar presión/);
  assert.match(source, /pressure-cell/);
  assert.match(source, /toggle\('show-pressure'/);
});

test('el estado vacío y la tabla usan el nuevo número de columnas', () => {
  assert.match(source, /colspan="6"/);
});

test('el CSV sigue disponible y la tabla reserva un hueco para la columna de presión', () => {
  assert.match(source, /data-action="csv"/);
  assert.match(source, /Exportar CSV/);
});
