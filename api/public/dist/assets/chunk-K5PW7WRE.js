import{a as i,b as l}from"./chunk-CQTK7RCE.js";import"./chunk-LLIISTR7.js";import{d as s,i as a,j as p}from"./chunk-IDTT5QG6.js";function c(e,n,r){if(!e||!e.count)return`<div class="stat-card"><p class="eyebrow">${s(e?.label||"")} <small>${s(n)}</small></p><p class="empty">Sin datos en el periodo.</p></div>`;let t=e.trend?.direction||"insuficiente",d=e.trend?.slopePerHour!=null?` \xB7 ${a(e.trend.slopePerHour,3)} ${n}/h`:"";return`<div class="stat-card">
    <p class="eyebrow">${s(e.label)} <small>${s(n)}</small></p>
    <div class="stat-row"><span>M\xEDn</span><strong>${a(e.min,r)}</strong><span>${s(i(e.minAt))}</span></div>
    <div class="stat-row"><span>M\xE1x</span><strong>${a(e.max,r)}</strong><span>${s(i(e.maxAt))}</span></div>
    <div class="stat-row"><span>Media</span><strong>${a(e.avg,r)}</strong><span>${e.count} muestras</span></div>
    <p class="${t==="insuficiente"?"hint":"coverage"}">Tendencia ${s(t)}${d}</p>
  </div>`}function v(e,n,r){return e?.length?`<div class="table-wrap"><table>
    <thead><tr><th>D\xEDa</th><th>Muestras</th><th>M\xEDn</th><th>Hora m\xEDn.</th><th>M\xE1x</th><th>Hora m\xE1x.</th><th>Media</th></tr></thead>
    <tbody>${e.map(t=>`<tr>
      <td>${s(t.date)}</td><td>${t.count}</td>
      <td>${a(t.min,r)} ${s(n)}</td><td>${s(i(t.minAt))}</td>
      <td>${a(t.max,r)} ${s(n)}</td><td>${s(i(t.maxAt))}</td>
      <td>${a(t.avg,r)} ${s(n)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`:'<p class="empty">Sin d\xEDas completos en el periodo seleccionado.</p>'}function g(e){return`
    <div class="stat-grid">
      ${c(e.metrics.temperature_c,"\xB0C",1)}
      ${c(e.metrics.humidity_pct,"%",1)}
      ${c({...e.metrics.pressure_pa,min:p(e.metrics.pressure_pa.min),max:p(e.metrics.pressure_pa.max),avg:p(e.metrics.pressure_pa.avg),trend:e.metrics.pressure_pa.trend?{...e.metrics.pressure_pa.trend,slopePerHour:p(e.metrics.pressure_pa.trend.slopePerHour)}:null},"mbar",1)}
    </div>
    <p class="${e.period.complete?"hint":"warn-box"}">${s(e.period.note)}</p>`}function h(e){let n=e.coverage,r=`<div class="fact-grid">
    <div><span>Recibidos</span><strong>${n.received}</strong></div>
    <div><span>Esperados</span><strong>${n.expected??"\u2014"}</strong></div>
    <div><span>Cobertura de recibidas</span><strong>${n.receivedPct!=null?`${a(n.receivedPct,1)} %`:"\u2014"}</strong></div>
    <div><span>Cobertura de aceptadas</span><strong>${n.validPct!=null?`${a(n.validPct,1)} %`:"\u2014"}</strong></div>
    <div><span>Aceptadas</span><strong>${n.valid} (${n.invalid} inv\xE1lidas)</strong></div>
    <div><span>Faltantes por tiempo</span><strong>${n.timeMissing??"\u2014"}</strong></div>
  </div>`,t=e.dewPoint,d=`<p class="coverage">Punto de roc\xEDo: <strong>${a(t.value,1)} \xB0C</strong> <span class="badge badge-muted">Calculado</span>${t.count?` \xB7 m\xEDn ${a(t.min,1)} / m\xE1x ${a(t.max,1)} \xB0C en el periodo`:""}</p>
    <p class="hint">${s(t.method)} ${(t.limitations||[]).map(s).join(" ")}</p>`,o=e.aemet.comparison,m=o.matched?`<div class="fact-grid">
        <div><span>Parejas (\xB1${o.windowMinutes} min)</span><strong>${o.matched}</strong></div>
        <div><span>Diferencia media</span><strong>${a(o.differences.avg,2)} \xB0C</strong></div>
        <div><span>Rango de diferencia</span><strong>${a(o.differences.min,1)} \u2026 ${a(o.differences.max,1)} \xB0C</strong></div>
      </div><p class="hint">Diferencia = microestaci\xF3n \u2212 AEMET. Proveedor AEMET \xB7 estaci\xF3n ${s(e.aemet.stationId||"\u2014")} \xB7 \xFAltima observaci\xF3n ${s(i(e.aemet.lastObservedAt))}.</p>`:`<p class="empty">Sin observaciones AEMET emparejables en el periodo (${e.aemet.observations} observaciones disponibles).</p>`;return`
    ${r}
    <h3>Res\xFAmenes diarios \xB7 temperatura</h3>
    ${v(e.weekly.dailyTemperature,"\xB0C",1)}
    <h3>Punto de roc\xEDo <span class="badge badge-muted">Calculado</span></h3>
    ${d}
    <h3>Comparaci\xF3n hist\xF3rica con AEMET <span class="badge badge-muted">Fuente externa</span></h3>
    ${m}
    <p class="hint">${(e.limits||[]).map(s).join(" ")}</p>
    ${l()}`}export{h as renderDemoDetails,g as renderDemoOverview};
