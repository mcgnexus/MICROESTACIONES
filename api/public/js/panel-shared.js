// Piezas compartidas entre el panel y su análisis de periodo, para no formar
// un ciclo de importación: el panel carga el análisis bajo demanda y ambos
// necesitan el formato de hora y la documentación plegable.
import { originLegend } from './origin-labels.js';

// Formato compacto de hora para las tarjetas de detalle.
export const stampText = (value) => (value
  ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—');

// Bloques de documentación comunes a los tres paneles. Se leen cuando se
// necesitan, pero no se atraviesan para consultar el valor de ahora: son
// metodología, calidad de datos y procedencia de las fuentes.
export function panelDocumentation() {
  return `
    <details class="technical-details">
      <summary>Qué significa cada etiqueta</summary>
      ${originLegend([
        { kind: 'medido', text: 'Medición directa de la microestación, con su hora. Aceptada por los controles automáticos de rango, marcas del equipo y hora: eso no demuestra calibración ni exactitud.' },
        { kind: 'forecast', provider: 'aemet', text: 'Previsión municipal u observación oficial de AEMET. Si AEMET no está disponible, se usa Open-Meteo y se nombra. Aún no ha ocurrido.' },
        { kind: 'calculated', text: 'Punto de rocío y diferencia con AEMET: valores derivados por fórmula, no observaciones. La diferencia puede relacionarse con distancia, altitud, exposición y entorno, y no se atribuye a un único factor.' },
        { kind: 'status', text: 'Estado observado del equipo o del canal. No es una previsión.' },
      ])}
    </details>
    <details class="technical-details">
      <summary>Metodología y calidad de datos</summary>
      <p class="hint">Las tendencias de cada gráfico son diferencias observadas entre la primera y la última lectura del periodo, no pendientes ajustadas ni pendientes pendientes de corregir.</p>
      <p class="hint">La calidad de los datos recibidos mide las lecturas recibidas frente a las esperadas según el intervalo configurado, y no el rendimiento del sensor. Las lecturas extrañas no se borran: se marcan como inválidas y siguen visibles, para que el histórico no pueda ocultar un problema de conectividad.</p>
      <p class="hint">Un vacío de avisos nunca significa «no hay riesgo»: si faltan datos o la previsión está caída, el panel lo dice en lugar de tranquilizar.</p>
      <p class="hint">Los avisos propios son orientativos y no son avisos oficiales.</p>
    </details>`;
}
