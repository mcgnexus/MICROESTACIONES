import{b as a}from"./chunk-HF2VTCNR.js";var o=e=>e?new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(e)):"\u2014";function s(){return`
    <details class="technical-details">
      <summary>Qu\xE9 significa cada etiqueta</summary>
      ${a([{kind:"medido",text:"Medici\xF3n directa de la microestaci\xF3n, con su hora. Aceptada por los controles autom\xE1ticos de rango, marcas del equipo y hora: eso no demuestra calibraci\xF3n ni exactitud."},{kind:"forecast",provider:"aemet",text:"Previsi\xF3n municipal u observaci\xF3n oficial de AEMET. Si AEMET no est\xE1 disponible, se usa Open-Meteo y se nombra. A\xFAn no ha ocurrido."},{kind:"calculated",text:"Punto de roc\xEDo y diferencia con AEMET: valores derivados por f\xF3rmula, no observaciones. La diferencia puede relacionarse con distancia, altitud, exposici\xF3n y entorno, y no se atribuye a un \xFAnico factor."},{kind:"status",text:"Estado observado del equipo o del canal. No es una previsi\xF3n."}])}
    </details>
    <details class="technical-details">
      <summary>Metodolog\xEDa y calidad de datos</summary>
      <p class="hint">Las tendencias de cada gr\xE1fico son diferencias observadas entre la primera y la \xFAltima lectura del periodo, no pendientes ajustadas ni pendientes pendientes de corregir.</p>
      <p class="hint">La calidad de los datos recibidos mide las lecturas recibidas frente a las esperadas seg\xFAn el intervalo configurado, y no el rendimiento del sensor. Las lecturas extra\xF1as no se borran: se marcan como inv\xE1lidas y siguen visibles, para que el hist\xF3rico no pueda ocultar un problema de conectividad.</p>
      <p class="hint">Un vac\xEDo de avisos nunca significa \xABno hay riesgo\xBB: si faltan datos o la previsi\xF3n est\xE1 ca\xEDda, el panel lo dice en lugar de tranquilizar.</p>
      <p class="hint">Los avisos propios son orientativos y no son avisos oficiales.</p>
    </details>`}export{o as a,s as b};
