import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleChartRows, chartTrend, makeChart, metric } from '../public/js/ui.js';

test('chart sampling bounds dense data and keeps the endpoints and local extrema', () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({
    observedAt: new Date(index * 1000).toISOString(),
    value: index === 777 ? 5000 : index === 778 ? -500 : Math.sin(index / 12),
  }));
  const sampled = sampleChartRows(rows, 'value', 300);

  assert.ok(sampled.length <= 300);
  assert.equal(sampled[0], rows[0]);
  assert.equal(sampled.at(-1), rows.at(-1));
  assert.ok(sampled.includes(rows[777]));
  assert.ok(sampled.includes(rows[778]));
  assert.deepEqual(sampled, [...sampled].sort((a, b) => rows.indexOf(a) - rows.indexOf(b)));
});

test('chart sampling excludes missing values and leaves short series intact', () => {
  const rows = [{ value: 1 }, { value: null }, { value: 2 }];
  assert.deepEqual(sampleChartRows(rows, 'value'), [rows[0], rows[2]]);
});

test('chart trends describe rising, falling, stable, and insufficient series', () => {
  const series = (values) => values.map((value, i) => ({
    observedAt: new Date(i * 30 * 60 * 1000).toISOString(), temperatureC: value,
  }));
  assert.equal(chartTrend(series([1, 2, 3]), 'temperatureC').direction, 'sube');
  assert.equal(chartTrend(series([3, 2, 1]), 'temperatureC').direction, 'baja');
  assert.equal(chartTrend(series([1, 2, 1]), 'temperatureC').direction, 'estable');
  assert.equal(chartTrend(series([1, 2]), 'temperatureC').direction, 'insuficiente');
});

test('metrics include an icon and graphs explain temperature trend with an arrow', () => {
  assert.match(metric('Temperatura', '19,2', '°C'), /🌡️/);
  const rows = [1, 2, 3].map((temperatureC, i) => ({
    observedAt: new Date(i * 30 * 60 * 1000).toISOString(), temperatureC,
  }));
  const chart = makeChart('Temperatura', rows, 'temperatureC', '#d47749', '°C');
  assert.match(chart, /chart-trend trend-sube/);
  assert.match(chart, /↑/);
  assert.match(chart, /calentamiento/);
});
