import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatedRange } from './stations.js';
import { coverageReport, intervalSegments } from './statistics.js';

// F07: el filtro «Mes» abre el mes natural entero, así que a día 9 el
// denominador incluía las semanas que aún no habían ocurrido y la estación
// aparecía como poco fiable por tiempo que no había transcurrido.

const NOW = new Date('2026-10-09T12:00:00Z');
const MONTH = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };

test('el mes en curso se evalúa solo hasta ahora, no hasta el 31', () => {
  const range = evaluatedRange(MONTH.from, MONTH.to, NOW);
  assert.equal(range.truncatedToNow, true);
  assert.equal(range.hasElapsed, true);
  assert.equal(range.evaluated.to, NOW.toISOString());
  assert.equal(range.evaluated.from, MONTH.from);
  // El rango pedido sigue siendo el del filtro: no se cambia lo que se filtra.
  assert.deepEqual(range.requested, MONTH);
});

test('el futuro no entra en el denominador de cobertura', () => {
  const range = evaluatedRange(MONTH.from, MONTH.to, NOW);
  const segments = intervalSegments({
    versions: [], currentIntervalSeconds: 600, from: range.evaluated.from,
    to: range.evaluated.to, defaultIntervalSeconds: 600,
  });
  const report = coverageReport({
    received: 1224, valid: 1224, invalid: 0, intervalSeconds: 600,
    from: range.evaluated.from, to: range.evaluated.to, serviceFrom: range.evaluated.from, segments,
  });
  // 8,5 días a 10 min = 1224 muestras esperadas, no las ~4470 del mes entero.
  assert.ok(report.expected < 1300, `esperadas ${report.expected} siguen incluyendo futuro`);
  assert.equal(report.timeMissing, 0);
  assert.equal(report.receivedPct, 100);
});

test('con el mismo número de recibidas, comparar contra el mes completo hunde la cobertura', () => {
  const received = 1224;
  const segmentsTo = (to) => intervalSegments({
    versions: [], currentIntervalSeconds: 600, from: MONTH.from, to, defaultIntervalSeconds: 600,
  });
  const fullMonth = coverageReport({
    received, valid: received, invalid: 0, intervalSeconds: 600, from: MONTH.from,
    to: MONTH.to, serviceFrom: MONTH.from, segments: segmentsTo(MONTH.to),
  });
  const untilNow = coverageReport({
    received, valid: received, invalid: 0, intervalSeconds: 600, from: MONTH.from,
    to: NOW.toISOString(), serviceFrom: MONTH.from, segments: segmentsTo(NOW.toISOString()),
  });
  // El caso reportado: mismo equipo, misma cobertura real, penalización distinta.
  assert.ok(fullMonth.receivedPct < 40, `mes completo ${fullMonth.receivedPct} %`);
  assert.ok(fullMonth.missing > 3000, `faltantes ${fullMonth.missing}`);
  assert.equal(untilNow.receivedPct, 100);
});

test('un rango ya pasado se evalúa entero, sin recortarse', () => {
  const past = { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' };
  const range = evaluatedRange(past.from, past.to, NOW);
  assert.equal(range.truncatedToNow, false);
  assert.equal(range.hasElapsed, true);
  assert.deepEqual(range.evaluated, past);
});

test('un rango que acaba hoy no se marca como truncado', () => {
  const today = { from: '2026-10-01T00:00:00.000Z', to: NOW.toISOString() };
  const range = evaluatedRange(today.from, today.to, NOW);
  assert.equal(range.truncatedToNow, false);
  assert.deepEqual(range.evaluated, today);
});

test('un rango enteramente futuro no se evalúa y no inventa cobertura', () => {
  const future = { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' };
  const range = evaluatedRange(future.from, future.to, NOW);
  assert.equal(range.hasElapsed, false);
  assert.equal(range.truncatedToNow, true);
  const report = coverageReport({
    received: 0, valid: 0, invalid: 0, intervalSeconds: 600,
    from: range.evaluated.from, to: range.evaluated.from, segments: [],
  });
  // Sin servicio transcurrido no se afirma ni que falta todo ni que está bien.
  assert.equal(report.receivedPct, null);
});

test('evaluar solo hasta ahora nunca desplaza el inicio del periodo', () => {
  const range = evaluatedRange(MONTH.from, MONTH.to, NOW);
  assert.ok(new Date(range.evaluated.from) <= new Date(NOW));
  assert.ok(new Date(range.evaluated.from) >= new Date(MONTH.from));
});

test('un tramo sin duración no genera esperadas ni una cobertura inventada', () => {
  // Con Math.max(1, …) una ventana vacía producía «falta 1» y 0 %.
  const report = coverageReport({
    received: 0, valid: 0, invalid: 0, intervalSeconds: 600,
    from: NOW.toISOString(), to: NOW.toISOString(),
  });
  assert.equal(report.expected, null);
  assert.equal(report.timeMissing, null);
  assert.equal(report.receivedPct, null);
  // Un tramo con algo de duración sigue contando lo que le corresponde.
  const minute = coverageReport({
    received: 6, valid: 6, invalid: 0, intervalSeconds: 600,
    from: NOW.toISOString(), to: new Date(NOW.getTime() + 60000).toISOString(),
  });
  assert.equal(minute.expected, 1);
  assert.equal(minute.receivedPct, 100);
});

test('la tabla distingue el rango pedido del evaluado cuando el filtro llega a futuro', () => {
  const source = readFileSync(new URL('../public/js/measurements.js', import.meta.url), 'utf8');
  // El texto tiene que nombrar el periodo evaluado y decir que el futuro no resta.
  assert.match(source, /cobertura hasta ahora/);
  assert.match(source, /ese futuro no resta fiabilidad/);
  assert.match(source, /gaps\.evaluated\.to/);
  // Y no puede anunciarlo cuando el rango pedido ya está en pasado.
  assert.match(source, /if \(!gaps\?\.evaluated \|\| !gaps\.truncatedToNow\) return ''/);
});

// ---- F08: el botón Cerrar del diálogo --------------------------------------
// El texto iba en #1f6241 sobre un degradado oscuro. El ratio se calcula aquí
// contra las tres paradas reales del degradado, no contra un color plano: un
// degradado tiene que cumplir en la parte más clara, que es la más restrictive.

const expand = (hex) => (hex.length === 4
  ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  : hex);
const srgb = (hex) => {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(expand(hex).slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [high, low] = [srgb(a), srgb(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const GRADIENT = ['#123e2e', '#174f48', '#07536b'];
// Los valores repetidos viven en tokens de :root; resolver `var(--x)` antes de
// medir conserva la comprobación de contraste sin fijar el literal en la regla.
const resolveVars = (css) => {
  const tokens = Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)]
    .map(([, name, value]) => [name, value.trim()]));
  return css.replace(/var\((--[\w-]+)(?:,([^)]*))?\)/g,
    (match, name, fallback) => tokens[name] ?? fallback ?? match);
};
const readCss = () => resolveVars(readFileSync(new URL('../public/app.css', import.meta.url), 'utf8'));

test('el color de Cerrar alcanza 4,5:1 en la parte más clara del degradado', () => {
  const css = readCss();
  const rule = css.match(/\.dialog-head \.quiet\{([^}]*)\}/);
  assert.ok(rule, 'no se encuentra la regla del botón Cerrar');
  const color = rule[1].match(/color:(#[0-9a-f]{3,6})/i)[1];
  const ratios = GRADIENT.map((stop) => contrast(color, stop));
  // El mínimo es el que manda: el texto tiene que leerse en todo el degradado.
  assert.ok(Math.min(...ratios) >= 4.5,
    `${color} da ${Math.min(...ratios).toFixed(2)}:1 en la parada más clara`);
});

test('el borde de Cerrar alcanza 3:1, el mínimo de componentes de interfaz', () => {
  const css = readCss();
  const rule = css.match(/\.dialog-head \.quiet\{([^}]*)\}/)[1];
  const border = rule.match(/border:1px solid (#[0-9a-f]{3,8})/i)[1];
  const alpha = border.length === 9 ? parseInt(border.slice(7), 16) / 255 : 1;
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const over = (stop) => {
    const [f, b] = [rgbOf(border.slice(0, 7)), rgbOf(stop)];
    const mixed = `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha))
      .toString(16).padStart(2, '0')).join('')}`;
    return contrast(mixed, stop);
  };
  const ratios = GRADIENT.map(over);
  assert.ok(Math.min(...ratios) >= 3,
    `el borde da ${Math.min(...ratios).toFixed(2)}:1 en la parte más clara`);
});

test('el verde anterior sobre el degradado no cumplía el mínimo', () => {
  // Fija el defecto que se corrige: si alguien restituye #1f6241, esto lo dice.
  const ratios = GRADIENT.map((stop) => contrast('#1f6241', stop));
  assert.ok(Math.max(...ratios) < 4.5, 'el verde antiguo llegaba al mínimo en alguna parada');
});

test('el botón Cerrar conserva área táctil y un símbolo de cierre', () => {
  const css = readCss();
  assert.match(css, /button, \.button-link[^{]*\{ min-height: 44px; \}/);
  const ui = readFileSync(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  // Aspa decorativa: se ve pero no duplica el nombre accesible «Cerrar».
  assert.match(ui, /<span class="dialog-close-mark" aria-hidden="true">✕<\/span>Cerrar/);
  // El texto visible se conserva: el aspa sola no basta.
  assert.match(ui, /data-dialog-close[^>]*>.*Cerrar/);
  // Escape sigue cerrando por el comportamiento nativo de <dialog>.
  assert.match(ui, /dialog\.close\(\)/);
});