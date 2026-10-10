// Demostración agrícola interactiva: tres escenarios simulados que se calculan
// por completo en el navegador, independientes de las mediciones reales. Esta
// simulación no consulta la API de mediciones, no crea avisos, no envía
// mensajes y no modifica configuraciones: es material para entender el servicio
// antes de instalar una estación.
import { escapeText, numberText } from './ui.js';
import { originBadge, originLegend } from './origin-labels.js';

const round1 = (value) => Math.round(value * 10) / 10;

// El umbral siempre se muestra con un decimal para que el cambio al mover el
// deslizador se vea aunque el valor sea redondo.
const thresholdText = (value) => Number(value).toLocaleString('es-ES', {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});

// Los escenarios se describen con puntos de control; entre ellos se interpola
// linealmente. Los valores son ilustrativos, no recomendaciones agronómicas.
export const SIM_SCENARIOS = [
  {
    id: 'noche-fria',
    title: 'Noche fría',
    short: 'Descenso nocturno y cruce de un umbral',
    start: { hour: 18, minute: 0 },
    durationMinutes: 720,
    stepMinutes: 30,
    comparator: 'below',
    threshold: { default: 2, min: -6, max: 10, step: 0.5 },
    intro: 'Una noche de invierno. La temperatura desciende y cruza un umbral que tú eliges.',
    distinguishForecast: true,
    series: [
      {
        id: 'forecast',
        label: 'Previsión externa',
        color: '#5a7d9a',
        dashed: true,
        control: [[0, 9.4], [120, 7.0], [240, 4.6], [300, 3.5], [360, 2.4], [420, 1.5],
          [480, 1.0], [540, 0.6], [600, 0.4], [660, 0.5], [720, 1.1]],
      },
      {
        id: 'observed',
        label: 'Descenso observado',
        color: '#c97742',
        dashed: false,
        control: [[0, 9.0], [60, 7.7], [120, 6.4], [180, 5.1], [240, 3.8], [300, 2.5],
          [360, 1.3], [420, 0.3], [480, -0.6], [540, -1.4], [600, -2.0], [660, -2.3], [720, -1.7]],
      },
    ],
    summary: 'La previsión ayuda a prepararse, pero el aviso local se basa en lo medido en tu emplazamiento: por eso las dos curvas pueden cruzar el umbral a horas distintas.',
  },
  {
    id: 'jornada-calurosa',
    title: 'Jornada calurosa',
    short: 'Temperatura elevada durante horas',
    start: { hour: 6, minute: 0 },
    durationMinutes: 840,
    stepMinutes: 30,
    comparator: 'above',
    threshold: { default: 30, min: 20, max: 40, step: 0.5 },
    intro: 'Un día de verano: la temperatura sube por la mañana, se mantiene elevada durante horas y baja al atardecer.',
    series: [
      {
        id: 'observed',
        label: 'Temperatura',
        color: '#c97742',
        dashed: false,
        control: [[0, 17.5], [60, 21.5], [120, 25.5], [180, 29.0], [240, 31.5], [300, 33.5],
          [360, 35.0], [420, 36.2], [480, 36.8], [540, 36.0], [600, 34.5], [660, 32.5],
          [720, 30.0], [780, 26.5], [840, 23.0]],
      },
    ],
    summary: 'La duración por encima del umbral importa tanto como el valor máximo: una hora muy alta y varias horas seguidas plantean situaciones distintas.',
  },
  {
    id: 'zonas-finca',
    title: 'Zonas de una finca',
    short: 'Hondonada frente a zona alta',
    start: { hour: 20, minute: 0 },
    durationMinutes: 840,
    stepMinutes: 30,
    comparator: 'below',
    threshold: { default: 2, min: -6, max: 10, step: 0.5 },
    intro: 'La misma noche en dos sectores de la finca: el aire frío se acumula abajo y la zona alta se mantiene más templada.',
    series: [
      {
        id: 'zona-alta',
        label: 'Zona alta',
        color: '#5a7d9a',
        dashed: false,
        control: [[0, 8.6], [120, 6.9], [240, 5.3], [360, 4.1], [480, 3.3], [600, 2.8],
          [720, 2.6], [780, 2.7], [840, 3.4]],
      },
      {
        id: 'hondonada',
        label: 'Hondonada',
        color: '#c97742',
        dashed: false,
        control: [[0, 7.5], [120, 4.8], [240, 2.6], [300, 1.6], [360, 0.7], [420, -0.2],
          [480, -1.0], [540, -1.7], [600, -2.2], [660, -2.5], [720, -2.6], [780, -2.0], [840, -0.9]],
      },
    ],
    summary: 'Una estación describe su emplazamiento. Conocer la diferencia real entre sectores exige un sensor en cada uno de ellos.',
  },
];

export const scenarioById = (id) => SIM_SCENARIOS.find((scenario) => scenario.id === id) || SIM_SCENARIOS[0];

// Valor de una serie de puntos de control en un minuto dado (interpolación
// lineal, fuera del rango se toma el extremo más cercano).
export function interpolate(control, minute) {
  if (!control.length) return null;
  if (minute <= control[0][0]) return control[0][1];
  const last = control[control.length - 1];
  if (minute >= last[0]) return last[1];
  for (let index = 1; index < control.length; index += 1) {
    const [x1, y1] = control[index];
    if (minute <= x1) {
      const [x0, y0] = control[index - 1];
      if (x1 === x0) return y1;
      return y0 + ((y1 - y0) * (minute - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

// Muestrea la serie cada stepMinutes, del inicio al final del escenario.
export function sampleSeries(scenario, definition) {
  const points = [];
  const end = scenario.durationMinutes;
  for (let minute = 0; minute < end; minute += scenario.stepMinutes) {
    points.push({ t: minute, temperatureC: interpolate(definition.control, minute) });
  }
  points.push({ t: end, temperatureC: interpolate(definition.control, end) });
  return points;
}

export const holdsValue = (temperatureC, threshold, comparator) => (
  comparator === 'above' ? temperatureC >= threshold : temperatureC <= threshold
);

// Tramos (en minutos desde el inicio) en los que la serie cumple el umbral,
// con los límites interpolados: es lo que permite decir "a partir de qué hora".
export function thresholdIntervals(points, threshold, comparator) {
  const intervals = [];
  let open = null;
  points.forEach((point, index) => {
    const inside = holdsValue(point.temperatureC, threshold, comparator);
    if (inside && open === null) {
      let from = point.t;
      if (index > 0 && !holdsValue(points[index - 1].temperatureC, threshold, comparator)) {
        from = crossingMinute(points[index - 1], point, threshold);
      }
      open = { from, to: point.t };
    } else if (inside) {
      open.to = point.t;
    } else if (open !== null) {
      open.to = crossingMinute(points[index - 1], point, threshold);
      intervals.push(open);
      open = null;
    }
  });
  if (open) {
    open.to = points[points.length - 1].t;
    intervals.push(open);
  }
  return intervals;
}

function crossingMinute(from, to, threshold) {
  const span = to.temperatureC - from.temperatureC;
  if (span === 0) return to.t;
  const ratio = (threshold - from.temperatureC) / span;
  return from.t + Math.min(1, Math.max(0, ratio)) * (to.t - from.t);
}

// Primer instante en el que se cruzaría el umbral, o null si no se cruza.
export function firstCrossing(points, threshold, comparator) {
  const intervals = thresholdIntervals(points, threshold, comparator);
  if (!intervals.length) return null;
  return { t: round1(intervals[0].from), temperatureC: threshold };
}

export function totalMinutes(intervals) {
  return round1(intervals.reduce((sum, interval) => sum + Math.max(0, interval.to - interval.from), 0));
}

// Hora local de reloj a partir del minuto transcurrido desde el inicio.
export function clockLabel(start, minute) {
  const total = (start.hour * 60 + start.minute + Math.round(minute) + 1440 * 4) % 1440;
  const hours = String(Math.floor(total / 60)).padStart(2, '0');
  const minutes = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDuration(minutes) {
  const value = Math.max(0, Math.round(minutes));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

// Nivel orientativo del calor sostenido: condiciones ambientales, nunca un
// diagnóstico veterinario. Lo simulado ya lo declara la etiqueta de la
// demostración; repetirlo aquí solo añadiría ruido.
export function heatStressNote(minutes) {
  if (minutes <= 0) {
    return { tone: 'muted', text: 'No se alcanza el umbral durante ningún tramo.' };
  }
  const duration = formatDuration(minutes);
  if (minutes < 120) {
    return {
      tone: 'warn',
      text: `Temperatura por encima del umbral durante ${duration}. Condiciones cálidas puntuales: conviene revisar sombra, agua y ventilación del ganado.`,
    };
  }
  return {
    tone: 'alert',
    text: `Temperatura por encima del umbral durante ${duration} seguidos. Riesgo orientativo de estrés térmico por el calor sostenido: refuerza sombra, agua y ventilación.`,
  };
}

// Construye el escenario completo con el umbral elegido: series, cruces y
// tramos, todo derivado de los datos simulados del propio escenario.
export function buildScenario(scenario, threshold) {
  const series = scenario.series.map((definition) => {
    const points = sampleSeries(scenario, definition);
    const intervals = thresholdIntervals(points, threshold, scenario.comparator);
    return {
      ...definition,
      points,
      intervals,
      sustained: totalMinutes(intervals),
      crossing: firstCrossing(points, threshold, scenario.comparator),
    };
  });
  return { scenario, threshold, series };
}

// Diferencia entre dos series en el instante más frío de la primera.
export function coldestGap(scenario, built) {
  const reference = built.series.find((item) => item.id === 'hondonada') || built.series[0];
  const other = built.series.find((item) => item.id !== reference.id);
  if (!other) return null;
  const coldest = reference.points.reduce((min, point) => (
    point.temperatureC < min.temperatureC ? point : min
  ), reference.points[0]);
  const otherValue = interpolate(other.points.map((point) => [point.t, point.temperatureC]), coldest.t);
  return {
    at: coldest.t,
    label: clockLabel(scenario.start, coldest.t),
    gap: round1(coldest.temperatureC - otherValue),
  };
}

function chartSvg(scenario, built) {
  const width = 560;
  const height = 216;
  const left = 46;
  const right = 12;
  const top = 16;
  const bottom = 30;
  const values = built.series.flatMap((item) => item.points.map((point) => point.temperatureC))
    .concat([built.threshold]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(1, (rawMax - rawMin) * 0.12);
  const low = Math.floor(rawMin - pad);
  const high = Math.ceil(rawMax + pad);
  const span = high - low || 1;
  const x = (minute) => left + (minute / scenario.durationMinutes) * (width - left - right);
  const y = (value) => height - bottom - ((value - low) / span) * (height - top - bottom);
  const yTicks = [high, round1((high + low) / 2), low];
  const grid = yTicks.map((value) => `
    <line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" class="sim-gridline"/>
    <text x="${left - 8}" y="${y(value) + 4}" class="sim-axis-label" text-anchor="end">${numberText(value, 0)}</text>`).join('');
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const minute = scenario.durationMinutes * fraction;
    return `<text x="${x(minute)}" y="${height - 8}" class="sim-axis-label" text-anchor="middle">${clockLabel(scenario.start, minute)}</text>`;
  }).join('');
  const thresholdLine = `
    <line x1="${left}" y1="${y(built.threshold)}" x2="${width - right}" y2="${y(built.threshold)}" class="sim-threshold-line"/>
    <text x="${width - right}" y="${y(built.threshold) - 6}" class="sim-threshold-svg" text-anchor="end">Umbral ${thresholdText(built.threshold)} °C</text>`;
  const paths = built.series.map((item) => {
    const d = item.points.map((point, index) => (
      `${index ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(point.temperatureC).toFixed(1)}`
    )).join(' ');
    const marker = item.crossing
      ? `<circle cx="${x(item.crossing.t).toFixed(1)}" cy="${y(built.threshold).toFixed(1)}" r="4.5" fill="${item.color}"/>`
      : '';
    return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="2.5"${item.dashed ? ' stroke-dasharray="7 5"' : ''}/>${marker}`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Serie simulada del escenario ${escapeText(scenario.title)} con el umbral ajustado">
    ${grid}${xTicks}${thresholdLine}${paths}
  </svg>`;
}

function legend(scenario, built) {
  return `<ul class="sim-legend">${built.series.map((item) => `
    <li><span class="sim-swatch${item.dashed ? ' is-dashed' : ''}" style="--swatch:${item.color}"></span>${escapeText(item.label)}</li>`).join('')}
    <li><span class="sim-swatch is-threshold"></span>Umbral local ajustable</li></ul>`;
}

function crossingText(scenario, item, threshold) {
  if (!item.crossing) return 'No se cruzaría con este umbral.';
  const when = `Cruzaría a las ${clockLabel(scenario.start, item.crossing.t)}`;
  return scenario.comparator === 'above'
    ? `${when} y se mantendría hasta ${clockLabel(scenario.start, item.intervals[item.intervals.length - 1].to)}.`
    : `${when}.`;
}

function resultRows(scenario, built) {
  const rows = built.series.map((item) => `
    <div class="sim-result-row">
      <span class="sim-swatch${item.dashed ? ' is-dashed' : ''}" style="--swatch:${item.color}"></span>
      <strong>${escapeText(item.label)}</strong>
      <span>${escapeText(crossingText(scenario, item, built.threshold))}</span>
    </div>`);
  if (scenario.distinguishForecast) {
    rows.push(`
      <div class="sim-result-row">
        <span class="sim-swatch is-threshold"></span>
        <strong>Umbral local</strong>
        <span>${thresholdText(built.threshold)} °C, el valor que tú eliges para que se genere el aviso.</span>
      </div>`);
  }
  return `<div class="sim-result-rows">${rows.join('')}</div>`;
}

// Resumen específico de cada escenario, con el lenguaje propio de su caso.
function scenarioSummary(scenario, built) {
  if (scenario.id === 'jornada-calurosa') {
    const item = built.series[0];
    const peak = item.points.reduce((max, point) => (point.temperatureC > max.temperatureC ? point : max), item.points[0]);
    const note = heatStressNote(item.sustained);
    return `<div class="sim-summary">
      <p class="sim-facts">Máximo <strong>${numberText(peak.temperatureC, 1)} °C</strong> a las ${clockLabel(scenario.start, peak.t)} · por encima del umbral <strong>${formatDuration(item.sustained)}</strong></p>
      <p class="sim-note tone-${note.tone}">${escapeText(note.text)}</p>
      <p class="hint">Valor orientativo basado únicamente en temperatura y duración: no es un diagnóstico veterinario ni una recomendación válida para toda la ganadería.</p>
    </div>`;
  }
  if (scenario.id === 'zonas-finca') {
    const gap = coldestGap(scenario, built);
    return `<div class="sim-summary">
      <p class="sim-facts">Diferencia en el punto más frío: <strong>${numberText(Math.abs(gap.gap), 1)} °C</strong> a las ${gap.label} (hondonada más fría).</p>
      <p class="hint">${escapeText(scenario.summary)}</p>
    </div>`;
  }
  return `<div class="sim-summary"><p class="hint">${escapeText(scenario.summary)}</p></div>`;
}

export function renderSimulationResult(scenario, threshold) {
  const built = buildScenario(scenario, threshold);
  return `${resultRows(scenario, built)}${scenarioSummary(scenario, built)}`;
}

export function renderSimulationChart(scenario, threshold) {
  const built = buildScenario(scenario, threshold);
  return `${chartSvg(scenario, built)}${legend(scenario, built)}`;
}

// Estado de la demostración: un umbral por escenario, todos locales.
export function initialSimulationState() {
  return {
    scenarioId: SIM_SCENARIOS[0].id,
    thresholds: Object.fromEntries(SIM_SCENARIOS.map((scenario) => [scenario.id, scenario.threshold.default])),
    explored: false,
  };
}

export function renderSimulationShell() {
  return `
    <div class="sim-shell" data-sim-root>
      <p class="sim-origin">${originBadge('simulated')}<span class="hint">Todo lo que hay en esta simulación se calcula aquí y no sale de la página.</span></p>
      <div class="sim-tabs" role="tablist" aria-label="Escenarios de la simulación">
        ${SIM_SCENARIOS.map((scenario, index) => `
          <button type="button" role="tab" class="sim-tab${index === 0 ? ' is-active' : ''}"
            aria-selected="${index === 0 ? 'true' : 'false'}" data-sim-scenario="${scenario.id}">${escapeText(scenario.title)}</button>`).join('')}
      </div>
      <div class="sim-panel">
        <div class="sim-controls">
          <p class="sim-scenario-title" data-sim-title></p>
          <p class="hint" data-sim-intro></p>
          <label class="sim-threshold-label" for="sim-threshold">Umbral del aviso
            <output id="sim-threshold-value" for="sim-threshold"></output></label>
          <input type="range" id="sim-threshold" data-sim-threshold min="0" max="1" step="0.5" value="0">
          <p class="sim-threshold-hint">Simulación: ajusta el umbral y observa cuándo aparecería un aviso.</p>
        </div>
        <div class="sim-chart" data-sim-chart></div>
        <div class="sim-result" data-sim-result aria-live="polite"></div>
      </div>
      <details class="sim-safety">
        <summary>Qué es exactamente esta simulación</summary>
        <p><strong>Los avisos que ves aquí son simulados y solo existen en esta simulación</strong>: no salen de esta página, no crean avisos reales, no envían mensajes y no modifican ninguna configuración.</p>
        <p>Los valores son ilustrativos y no sustituyen criterios agronómicos ni veterinarios.</p>
      </details>
      ${originLegend([
        { kind: 'simulated' },
        { kind: 'forecast', provider: 'openmeteo', text: 'Serie discontinua: lo que un proveedor externo habría previsto. También es un dato inventado para el ejemplo.' },
      ])}
    </div>
    <div class="sim-lead hidden" data-sim-lead>
      <p class="sim-lead-title">¿Y tu caso concreto?</p>
      <p class="hint">Completa tu municipio, tu cultivo o tu ganado e indícanos tu interés en una futura instalación. Te contactaremos para valorarlo; el envío no programa ninguna instalación.</p>
      <div class="panel access-request" data-lead-embed data-lead-title="Interés en una futura instalación"
        data-lead-description="Cuéntanos dónde está tu finca, qué cultivo o ganado tienes y qué te interesa. Revisamos cada solicitud y te contactamos; el envío no programa una instalación."
        data-lead-success="Solicitud recibida. Te contactaremos para valorar la instalación."></div>
    </div>`;
}

// Monta los controles: cambia de escenario, mueve el umbral y, tras la primera
// interacción, revela el bloque de captación con el interés precargado.
export function mountFarmSimulation(root = document) {
  const shell = root.querySelector('[data-sim-root]');
  if (!shell) return () => {};
  const state = initialSimulationState();
  const tabs = [...shell.querySelectorAll('[data-sim-scenario]')];
  const slider = shell.querySelector('[data-sim-threshold]');
  const title = shell.querySelector('[data-sim-title]');
  const intro = shell.querySelector('[data-sim-intro]');
  const chart = shell.querySelector('[data-sim-chart]');
  const result = shell.querySelector('[data-sim-result]');
  const value = shell.querySelector('#sim-threshold-value');
  const leadBlock = root.querySelector('[data-sim-lead]');

  const revealLead = () => {
    if (state.explored || !leadBlock) return;
    state.explored = true;
    const interest = leadBlock.querySelector('select[name="interest"]');
    if (interest) interest.value = 'futura_instalacion';
    leadBlock.classList.remove('hidden');
  };

  const draw = () => {
    const scenario = scenarioById(state.scenarioId);
    const threshold = state.thresholds[scenario.id];
    slider.min = String(scenario.threshold.min);
    slider.max = String(scenario.threshold.max);
    slider.step = String(scenario.threshold.step);
    slider.value = String(threshold);
    value.textContent = `${thresholdText(threshold)} °C`;
    title.textContent = scenario.title;
    intro.textContent = scenario.intro;
    chart.innerHTML = renderSimulationChart(scenario, threshold);
    result.innerHTML = renderSimulationResult(scenario, threshold);
    tabs.forEach((tab) => {
      const active = tab.dataset.simScenario === scenario.id;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };

  const onTab = (event) => {
    state.scenarioId = event.currentTarget.dataset.simScenario;
    draw();
    revealLead();
  };
  const onSlider = () => {
    state.thresholds[state.scenarioId] = Number(slider.value);
    draw();
    revealLead();
  };
  tabs.forEach((tab) => tab.addEventListener('click', onTab));
  slider.addEventListener('input', onSlider);
  draw();

  return () => {
    tabs.forEach((tab) => tab.removeEventListener('click', onTab));
    slider.removeEventListener('input', onSlider);
  };
}
