import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleChartRows, chartTrend, chartYDomain, chartGapThreshold, makeChart, metric } from '../public/js/ui.js';

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
  assert.match(chart, /viewBox="0 0 560 200"/);
});

test('pressure chart uses a broader reference scale than its measured range', () => {
  const domain = chartYDomain('pressurePa', 91310, 91557);
  assert.ok(domain.high - domain.low >= 5000);
  assert.ok(domain.low < 91310);
  assert.ok(domain.high > 91557);
});

test('gap threshold follows normal cadence instead of a majority of missed samples', () => {
  const rows = [0, 5, 10, 15, 135, 255].map((minutes) => ({
    observedAt: new Date(minutes * 60 * 1000).toISOString(), temperatureC: minutes,
  }));
  assert.equal(chartGapThreshold(rows), 5 * 60 * 1000 * 2.5);
  const svg = makeChart('Temperatura', rows, 'temperatureC', '#d47749', '°C');
  assert.equal((svg.match(/<polyline/g) || []).length, 3);
});
