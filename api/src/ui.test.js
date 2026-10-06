import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleChartRows, chartTrend, chartYDomain, chartGapThreshold, makeChart, metric, chartSection, pressureMbar, pressureText, trendWindowRows } from '../public/js/ui.js';
import { renderStationCard } from '../public/js/panel.js';

test('pressure values are converted from Pa to mbar in the UI and station charts', () => {
  assert.equal(pressureMbar(101325), 1013.25);
  assert.equal(pressureText(90000), '900');
  const history = [0, 1, 2].map((index) => ({ observedAt: new Date(index * 3600000).toISOString(), pressurePa: 90000 + index * 100 }));
  const section = chartSection(history, { pressure_min: 90000, pressure_max: 90200, pressure_avg: 90100 });
  assert.match(section, /<h3>Presión<\/h3>/);
  assert.match(section, /chart-current"><strong>902<\/strong><small>mbar<\/small>/);
  assert.match(section, /900/);
  assert.doesNotMatch(section, /Presión · Pa/);
});

test('station cards compare microstation and AEMET, and prefer AEMET daily forecasts', () => {
  const html = renderStationCard({
    device: { id: 'station-1', name: 'Huéscar', sensors: { battery: true } },
    status: { connectivity: 'online', configVersion: 1, batteryLevel: 'ok' },
    latest: { observedAt: '2026-01-01T12:00:00Z', temperatureC: 18, humidityPct: 55, pressurePa: 90000, batteryMv: 3900, isValidated: true },
    history: [], summary: { expected: 0, valid_count: 1, invalid_count: 0, coverage_pct: 100 },
    forecasts: [], nearby: { stations: [], message: 'Ubicación de estación no configurada.' },
    weather: {
      configured: true, location: 'Huéscar', advisories: [], aemetMissing: [], errors: [],
      openMeteo: { current: { temperatureC: 17 }, daily: [{ date: '2026-01-02' }], hourly: [{ forecastFor: '2026-01-02T12:00:00Z' }] },
      aemet: {
        observation: { stationId: '5051X', observedAt: '2026-01-01T11:00:00Z', temperatureC: 17, humidityPct: 60, pressureHpa: 900, precipitationMm: 0, windKmh: 5, windGustKmh: 8 },
        forecast: { municipality: 'Huéscar', days: [{ date: '2026-01-02', temperatureMinC: 4, temperatureMaxC: 16, sky: 'Despejado' }] },
        warnings: [],
      },
    },
  });
  assert.match(html, /Microestación/);
  assert.match(html, /AEMET/);
  assert.match(html, /<strong>900<\/strong><small>mbar<\/small>/);
  assert.match(html, /5051X/);
  assert.match(html, /MICROESTACIÓN · MEDICIÓN DIRECTA/);
  assert.match(html, /Próximas mediciones locales/);
  assert.match(html, /Radiación UV/);
  assert.match(html, /AEMET aporta ahora viento y precipitación/);
  assert.match(html, /Previsión municipal AEMET/);
  // El hero mantiene la previsión del día de AEMET y el bloque externo da el detalle.
  assert.match(html, /hero-forecast/);
  assert.match(html, /Previsión · AEMET/);
  assert.doesNotMatch(html, /Previsión Open-Meteo · 5 días|Previsión por horas/);
  // La previsión queda justo después de la comparación AEMET y antes de las gráficas.
  assert.ok(html.indexOf('aemet-readings') < html.indexOf('weather-panel'));
  assert.ok(html.indexOf('weather-panel') < html.indexOf('tecrural-chart-card'));
  // Tarjetas de lectura y gráficos ampliables.
  assert.match(html, /data-detail-key="station-\d+" data-detail-metric="temperatureC"/);
  assert.match(html, /data-detail-source="aemet"/);
});

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
  assert.match(chart, /chart-area/);
  assert.match(chart, /tecrural-chart-card/);
  assert.match(chart, /chart-current/);
  assert.match(chart, /<strong>3<\/strong>/);
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

test('trend window keeps the current local day and falls back to recent readings', () => {
  const now = new Date('2026-05-20T18:00:00');
  const row = (iso, value) => ({ observedAt: iso, temperatureC: value });
  const mixed = [
    row('2026-05-18T10:00:00', 10),
    row('2026-05-19T10:00:00', 20),
    row('2026-05-20T01:00:00', 3),
    row('2026-05-20T06:00:00', 6),
    row('2026-05-20T12:00:00', 12),
  ];
  const today = trendWindowRows(mixed, now);
  assert.equal(today.length, 3);
  assert.equal(today[0].temperatureC, 3);

  const stale = [
    row('2026-05-19T01:00:00', 1),
    row('2026-05-19T02:00:00', 2),
    row('2026-05-19T03:00:00', 3),
    row('2026-05-19T04:00:00', 4),
  ];
  // Sin datos del día usa las últimas 3 h; si tampoco hay, cae a las últimas 5.
  assert.equal(trendWindowRows(stale, now).length, 4);
  assert.equal(trendWindowRows(stale.slice(0, 2), now).length, 2);
});

test('chart cards expose detail attributes when a key is provided', () => {
  const rows = [1, 2, 3].map((temperatureC, i) => ({
    observedAt: new Date(Date.now() - (3 - i) * 3600000).toISOString(), temperatureC,
  }));
  const svg = makeChart('Temperatura', rows, 'temperatureC', '#d47749', '°C', 1, null, { key: 'station-9' });
  assert.match(svg, /data-detail-key="station-9" data-detail-metric="temperatureC" data-detail-source="local"/);
  assert.match(svg, /role="button" tabindex="0"/);
});
