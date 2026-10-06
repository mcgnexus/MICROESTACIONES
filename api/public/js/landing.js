// Rutas y secciones de la web pública. La portada no pide sesión; el panel sí.
import { api, escapeText, numberText } from './ui.js';
import { mountLeadForms } from './leads.js';
import { sinceText } from './farm-cards.js';

export const PUBLIC_SECTIONS = new Set(['como-funciona', 'zonas', 'alertas', 'microclimas', 'preguntas', 'solicitar-piloto']);
export const PRIVATE_SECTIONS = new Set(['panel', 'estaciones', 'avisos', 'admin', 'cuenta']);

// Desplaza la vista a una sección pública de la portada.
export function scrollToPublicSection(section) {
  const target = document.getElementById(section);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Tabla comparativa con datos públicos reales (sin coordenadas).
export function renderPublicZones(stations) {
  const reference = stations[0]?.temperatureC;
  return `<div class="table-wrap"><table class="comparison-table">
    <thead><tr><th>Zona</th><th>Temperatura</th><th>Humedad</th><th>Diferencia</th><th>Última lectura</th></tr></thead>
    <tbody>${stations.map((station) => {
      const difference = station.temperatureC != null && reference != null ? station.temperatureC - reference : null;
      const label = station.zone ? `${station.zone} · ${station.name}` : station.name;
      return `<tr>
        <td>${escapeText(label)}</td>
        <td>${station.temperatureC == null ? '—' : `${numberText(station.temperatureC)} °C`}</td>
        <td>${station.humidityPct == null ? '—' : `${numberText(station.humidityPct, 0)} %`}</td>
        <td>${difference == null ? 'referencia' : `${difference > 0 ? '+' : ''}${numberText(difference)} °C`}</td>
        <td>${escapeText(sinceText(station.observedAt) || '—')}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// Sustituye el ejemplo estático por estaciones reales que han autorizado publicar.
export async function loadPublicZones(root = document) {
  const container = root.querySelector('#zonas-table');
  if (!container) return;
  try {
    const { stations } = await api('/api/v1/public/stations');
    const withReadings = stations.filter((station) => station.temperatureC != null || station.humidityPct != null);
    if (withReadings.length < 2) return;
    container.innerHTML = renderPublicZones(withReadings);
    const note = root.querySelector('#zonas-source');
    if (note) note.textContent = 'Datos agregados de estaciones que han autorizado compartir su información, sin coordenadas exactas.';
  } catch {
    // Sin datos públicos se mantiene el ejemplo ilustrativo.
  }
}

// Monta los formularios de captación y carga las zonas reales si las hay.
export function initLanding() {
  mountLeadForms();
  loadPublicZones();
}
