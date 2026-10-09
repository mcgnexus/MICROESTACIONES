import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleChartRows, chartTrend, chartYDomain, chartGapThreshold, makeChart, metric, chartSection, pressureMbar, pressureText, trendWindows, trendWindowRows, trendPeriodLabel, validationBadge, verificationBadge } from '../public/js/ui.js';
import { renderStationCard } from '../public/js/panel.js';

test('an accepted reading is labelled as automatic-control accepted, not certified', () => {
  const html = validationBadge({ isValidated: true });
  assert.match(html, />Aceptada</);
  assert.match(html, /No demuestra calibración/);
  assert.match(validationBadge({ isValidated: false, validationFlags: 1 }), />Inválida</);
});

test('verification badge separates "unverified" from "verified against a reference"', () => {
  assert.match(verificationBadge({}), /Sin verificar/);
  assert.match(verificationBadge({ status: 'unverified' }), /no demuestra calibración/i);
  assert.match(verificationBadge({ status: 'pending' }), /Verificación pendiente/);
  const verified = verificationBadge({ status: 'verified', reference: 'patrón 5051X' });
  assert.match(verified, /Verificada frente a referencia/);
  assert.match(verified, /Referencia: patrón 5051X/);
});

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

test('trend magnitude is the observed difference, not the fitted line', () => {
  // Serie reportada: cae desde la tarde pero el día empezó más frío. Una
  // regresión sobre el día completo daba aquí un "calentamiento" de +12,3 °C.
  const rows = [
    ['2026-05-20T15:00:00', 14.5],
    ['2026-05-20T18:00:00', 14.2],
    ['2026-05-20T21:00:00', 14.0],
    ['2026-05-20T22:30:00', 14.1],
    ['2026-05-20T23:14:00', 13.7],
  ].map(([iso, temperatureC]) => ({ observedAt: new Date(iso).toISOString(), temperatureC }));
  const trend = chartTrend(rows, 'temperatureC');
  assert.equal(trend.direction, 'baja');
  assert.ok(Math.abs(trend.change - (13.7 - 14.5)) < 1e-9, `change ${trend.change}`);
  assert.equal(trend.from, 14.5);
  assert.equal(trend.to, 13.7);
  assert.equal(trend.samples, 5);
  assert.ok(trend.spanMs > 0);

  // Una serie en V no debe dar un salto ascendente ficticio.
  const valley = [20, 14, 13, 16, 15].map((temperatureC, i) => ({
    observedAt: new Date(i * 20 * 60 * 1000).toISOString(), temperatureC,
  }));
  const v = chartTrend(valley, 'temperatureC');
  assert.ok(Math.abs(v.change - (15 - 20)) < 1e-9, `change ${v.change}`);
});

test('trend windows separate the recent hour from the day and relabel each fallback', () => {
  const now = new Date('2026-05-20T18:00:00');
  const row = (iso, value) => ({ observedAt: iso, temperatureC: value });
  const today = [
    row('2026-05-20T12:00:00', 12),
    row('2026-05-20T16:45:00', 15),
    row('2026-05-20T17:15:00', 15.4),
    row('2026-05-20T17:30:00', 14.6),
  ];
  const withDay = trendWindows(today, now);
  assert.equal(withDay.daily.label, 'Hoy');
  assert.equal(withDay.daily.fallback, false);
  assert.equal(withDay.recent.label, 'Última hora');
  assert.equal(withDay.recent.fallback, false);
  assert.equal(withDay.recent.rows.length, 3);
  assert.equal(withDay.daily.rows.length, 4);

  // Sin datos del día: cambia la etiqueta, no se mantiene la de "Hoy".
  const yesterday = [
    row('2026-05-19T10:00:00', 10),
    row('2026-05-19T11:00:00', 12),
    row('2026-05-19T12:00:00', 11),
    row('2026-05-19T13:00:00', 14),
  ];
  const stale = trendWindows(yesterday, now);
  assert.equal(stale.daily.label, 'Últimas 3 h');
  assert.equal(stale.daily.fallback, true);
  assert.equal(stale.daily.rows.length, 4);

  const older = [
    row('2026-05-18T10:00:00', 10),
    row('2026-05-18T13:00:00', 12),
    row('2026-05-18T17:00:00', 11),
    row('2026-05-18T20:00:00', 14),
    row('2026-05-18T22:00:00', 13),
  ];
  const oldest = trendWindows(older, now);
  assert.equal(oldest.daily.label, 'Últimas 5 lecturas');
  assert.equal(oldest.daily.fallback, true);
  assert.equal(oldest.daily.rows.length, 5);
});

test('the recent window is anchored on the last reading, not on the clock', () => {
  const now = new Date('2026-05-20T18:00:00');
  // Última lectura de hace 5 h: con una ventana de reloj no habría nada que evaluar.
  const lagged = [
    { observedAt: '2026-05-20T09:00:00', temperatureC: 15.0 },
    { observedAt: '2026-05-20T11:00:00', temperatureC: 15.5 },
    { observedAt: '2026-05-20T12:00:00', temperatureC: 15.4 },
    { observedAt: '2026-05-20T12:20:00', temperatureC: 15.2 },
    { observedAt: '2026-05-20T12:40:00', temperatureC: 14.9 },
    { observedAt: '2026-05-20T13:00:00', temperatureC: 14.4 },
  ];
  const { recent } = trendWindows(lagged, now);
  assert.equal(recent.label, 'Última hora');
  assert.equal(recent.rows.length, 4);
  assert.equal(chartTrend(recent.rows, 'temperatureC').direction, 'baja');

  // Solo dos lecturas dentro de la hora: degrada y lo declara.
  // Última lectura 13:00: solo caen dos lecturas dentro de la hora (12:30 y 13:00).
  const sparse = [
    { observedAt: '2026-05-20T11:00:00', temperatureC: 15.3 },
    { observedAt: '2026-05-20T12:30:00', temperatureC: 14.9 },
    { observedAt: '2026-05-20T13:00:00', temperatureC: 14.4 },
  ];
  const degraded = trendWindows(sparse, now);
  assert.equal(degraded.recent.label, 'Últimas 3 lecturas');
  assert.equal(degraded.recent.fallback, true);
  assert.equal(degraded.recent.rows.length, 3);
});

test('trendPeriodLabel falls back to a stated default when there is no period', () => {
  assert.equal(trendPeriodLabel(null), 'sin periodo');
  assert.equal(trendPeriodLabel({ label: 'Hoy' }), 'Hoy');
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

test('chart shows a falling recent hour instead of a day-long rise', () => {
  // Caso reportado: 23:14 con 13,7 °C, flecha ascendente y «12,3 °C en el día».
  const now = new Date('2026-05-20T23:14:00');
  const rows = [
    ['2026-05-20T12:00:00', 12.0],
    ['2026-05-20T15:00:00', 14.5],
    ['2026-05-20T19:00:00', 14.4],
    ['2026-05-20T22:00:00', 14.2],
    ['2026-05-20T22:20:00', 14.3],
    ['2026-05-20T22:40:00', 14.0],
    ['2026-05-20T23:14:00', 13.7],
  ].map(([time, temperatureC]) => ({ observedAt: new Date(time).toISOString(), temperatureC }));
  const chart = makeChart('Temperatura', rows, 'temperatureC', '#d47749', '°C', 1, null, null, rows, now);
  assert.match(chart, /chart-trend trend-baja/);
  assert.match(chart, /↓/);
  assert.match(chart, /Última hora/);
  assert.match(chart, /Hoy/);
  // 13,7 tras 14,3 en la última hora: la cifra visible es la diferencia observada.
  assert.match(chart, /0,6 °C/);
  assert.doesNotMatch(chart, /12,3 °C/);
  assert.doesNotMatch(chart, /en el día/);
  // Cada bloque declara su periodo y su método.
  assert.match(chart, /Diferencia entre la primera y la última lectura del periodo/);
});

test('trend block collapses to one when the recent hour is also the whole day', () => {
  const now = new Date('2026-05-20T13:00:00');
  const rows = [
    ['2026-05-20T12:00:00', 12.0],
    ['2026-05-20T12:20:00', 12.4],
    ['2026-05-20T12:40:00', 12.2],
    ['2026-05-20T13:00:00', 12.6],
  ].map(([time, temperatureC]) => ({ observedAt: new Date(time).toISOString(), temperatureC }));
  const chart = makeChart('Temperatura', rows, 'temperatureC', '#d47749', '°C', 1, null, null, rows, now);
  assert.equal((chart.match(/chart-trend-item/g) || []).length, 1);
  assert.match(chart, /Última hora/);
  assert.doesNotMatch(chart, /chart-trend-daily/);
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
