import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMetricCard, renderDemoOverview } from '../public/js/demo-analysis.js';
import { statisticsTrendSentence } from '../public/js/statistics.js';

test('estadísticas expresa el cambio total estimado, no la pendiente por hora', () => {
  const text = statisticsTrendSentence('temperature_c', {
    direction: 'baja', totalChange: -1.2, slopePerHour: -18,
  }, 'Últimos 7 días', 1);
  assert.equal(text, 'La temperatura muestra una bajada estimada de 1,2 °C en los últimos 7 días.');
  assert.doesNotMatch(text, /18|por hora/);
});

test('la tarjeta del análisis de solo lectura usa la misma frase estimada', () => {
  const html = demoMetricCard({
    label: 'Temperatura', count: 5, min: 5, max: 8, avg: 6,
    trend: { direction: 'baja', totalChange: -1.2, slopePerHour: -18 },
  }, '°C', 1, 'temperature_c', 'Últimas 24 horas');
  assert.match(html, /La temperatura muestra una bajada estimada de 1,2 °C en las últimas 24 horas/);
  assert.doesNotMatch(html, /18 °C\/h/);
});

test('la frase de presión usa el cambio total convertido a milibares', () => {
  const metric = (label, unit, totalChange) => ({
    label, unit, count: 3, min: 90000, max: 90120, avg: 90060,
    minAt: '2026-01-01T00:00:00Z', maxAt: '2026-01-01T01:00:00Z',
    trend: { direction: 'baja', totalChange, slopePerHour: -120 },
  });
  const data = {
    hours: 24,
    metrics: {
      temperature_c: metric('Temperatura', '°C', -1.2),
      humidity_pct: metric('Humedad', '%', 2),
      pressure_pa: metric('Presión', 'Pa', -120),
    },
    coverage: { received: 3, expected: 3, receivedPct: 100, validPct: 100, valid: 3, invalid: 0, timeMissing: 0 },
    period: { complete: true, note: 'El periodo solicitado está cubierto por datos.' },
  };
  const html = renderDemoOverview(data);
  assert.match(html, /La presión atmosférica muestra una bajada estimada de 1,2 milibares en las últimas 24 horas/);
});
