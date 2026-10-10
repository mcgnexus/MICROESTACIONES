// Etiqueta persistente de procedencia.
//
// La precisión sobre de dónde sale cada dato no depende de que cada tarjeta
// repita la explicación. El dato lleva siempre su etiqueta —«Medido»,
// «Previsión AEMET», «Simulación»— y el detalle se abre solo cuando se pide.
//
// Regla: la etiqueta nunca sustituye al origen ni a la antigüedad. Cada una
// declara el proveedor real y, cuando la hay, la hora de la lectura. Lo que
// este módulo evita es que esa misma precisión se escriba cuatro veces en la
// misma pantalla: aquí vive una vez y el resto de bloques la reutilizan.

import { escapeText, dateText } from './ui.js';

// Tono: lo medido es el único que se presenta con confianza; el resto se
// distingue de un vistazo sin leer el texto.
const TONES = {
  medido: 'valid',
  aceptada: 'valid',
  rejected: 'invalid',
  forecast: 'warn',
  calculated: 'muted',
  simulated: 'muted',
  status: 'muted',
};

export const ORIGIN_LABELS = {
  medido: 'Medido',
  forecast: 'Previsión',
  calculated: 'Calculado',
  simulated: 'Simulación',
  status: 'Estado',
};

// Explicación completa de cada clase. Solo se muestra al desplegar: en pantalla
// basta con la etiqueta.
export const ORIGIN_HINTS = {
  medido: 'Medición directa de la microestación. Aceptada por los controles automáticos de rango, marcas del equipo y hora: eso no demuestra calibración ni exactitud.',
  forecast: 'Previsión de un proveedor externo. Aún no ha ocurrido y no procede de esta estación.',
  calculated: 'Valor derivado por una fórmula a partir de otros datos. No es una observación.',
  simulated: 'Valor ilustrativo de la demostración. No procede de ninguna estación ni finca existente.',
  status: 'Estado observado de la estación o del canal. No es una previsión.',
};

const providerLabel = (provider) => ({
  aemet: 'AEMET', openmeteo: 'Open-Meteo', open_meteo: 'Open-Meteo',
}[String(provider || '').toLowerCase()] || '');

/**
 * Etiqueta de procedencia para un bloque de dato.
 *
 * `kind` es una de las claves de ORIGIN_LABELS. `provider` añade el nombre del
 * proveedor a la etiqueta («Previsión AEMET»), que es lo que permite distinguir
 * dos cosas que comparten naturaleza. `observedAt` mantiene la antigüedad
 * visible en la propia etiqueta, sin esperar a desplegar nada.
 */
export function originBadge(kind, { provider = null, observedAt = null, extra = '' } = {}) {
  const key = ORIGIN_LABELS[kind] ? kind : 'status';
  const providerText = key === 'forecast' ? providerLabel(provider) : '';
  const label = `${ORIGIN_LABELS[key]}${providerText ? ` ${providerText}` : ''}`;
  const when = observedAt ? ` · ${dateText(observedAt)}` : '';
  const title = `${ORIGIN_HINTS[key]}${when}${extra ? ` ${extra}` : ''}`;
  return `<span class="badge badge-${TONES[key] || 'muted'} origin-badge" data-origin="${key}"
    title="${escapeText(title)}">${escapeText(label)}</span>`;
}

// Una sola vez por contexto, no por tarjeta: la lista de etiquetas con su
// explicación plegada. Sustituye a las notas repetidas al pie de cada bloque.
export function originLegend(items) {
  const entries = (items || []).filter((item) => item && ORIGIN_LABELS[item.kind]);
  if (entries.length < 2) return '';
  return `<details class="origin-legend">
    <summary>Qué significa cada etiqueta</summary>
    <dl>${entries.map((item) => `<div>
      <dt>${originBadge(item.kind, { provider: item.provider })}</dt>
      <dd>${escapeText(item.text || ORIGIN_HINTS[item.kind])}</dd>
    </div>`).join('')}</dl>
  </details>`;
}