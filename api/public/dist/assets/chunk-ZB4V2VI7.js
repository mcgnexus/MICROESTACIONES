import{a as p,b as $}from"./chunk-JWF3JEHO.js";import"./chunk-IJFFHP3P.js";import{E as m,F as v,d as t,i as a,j as i}from"./chunk-VEUGMMMA.js";function l(e,s,o,n,d){if(!e||!e.count)return`<div class="stat-card"><p class="eyebrow">${t(e?.label||"")} <small>${t(s)}</small></p><p class="empty">Sin datos en el periodo.</p></div>`;let r=e.trend||{direction:"insuficiente",totalChange:null},c=v(n,r.direction,r.totalChange,d,o,{estimated:!0});return`<div class="stat-card">
    <p class="eyebrow">${t(e.label)} <small>${t(s)}</small></p>
    <div class="stat-row"><span>M\xEDn</span><strong>${a(e.min,o)}</strong><span>${t(p(e.minAt))}</span></div>
    <div class="stat-row"><span>M\xE1x</span><strong>${a(e.max,o)}</strong><span>${t(p(e.maxAt))}</span></div>
    <div class="stat-row"><span>Media</span><strong>${a(e.avg,o)}</strong><span>${e.count} muestras</span></div>
    <p class="${r.direction==="insuficiente"?"hint":"coverage"}">${r.direction==="sube"?"\u2191 ":r.direction==="baja"?"\u2193 ":r.direction==="estable"?"\u2192 ":""}${t(c)}</p>
  </div>`}function u(e,s,o){return e?.length?`<div class="table-wrap"><table>
    <thead><tr><th>D\xEDa</th><th>Muestras</th><th>M\xEDn</th><th>Hora m\xEDn.</th><th>M\xE1x</th><th>Hora m\xE1x.</th><th>Media</th></tr></thead>
    <tbody>${e.map(n=>`<tr>
      <td>${t(n.date)}</td><td>${n.count}</td>
      <td>${a(n.min,o)} ${t(s)}</td><td>${t(p(n.minAt))}</td>
      <td>${a(n.max,o)} ${t(s)}</td><td>${t(p(n.maxAt))}</td>
      <td>${a(n.avg,o)} ${t(s)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`:'<p class="empty">Sin d\xEDas completos en el periodo seleccionado.</p>'}function b(e){let s=m(e.hours);return`
    <div class="stat-grid">
      ${l(e.metrics.temperature_c,"\xB0C",1,"temperature_c",s)}
      ${l(e.metrics.humidity_pct,"%",1,"humidity_pct",s)}
      ${l({...e.metrics.pressure_pa,min:i(e.metrics.pressure_pa.min),max:i(e.metrics.pressure_pa.max),avg:i(e.metrics.pressure_pa.avg),trend:e.metrics.pressure_pa.trend?{...e.metrics.pressure_pa.trend,slopePerHour:i(e.metrics.pressure_pa.trend.slopePerHour),totalChange:i(e.metrics.pressure_pa.trend.totalChange)}:null},"milibares",1,"pressure_pa",s)}
    </div>
    <p class="${e.period.complete?"hint":"warn-box"}">${t(e.period.note)}</p>`}function f(e){let s=e.coverage,o=`<div class="fact-grid">
    <div><span>Recibidos</span><strong>${s.received}</strong></div>
    <div><span>Esperados</span><strong>${s.expected??"\u2014"}</strong></div>
    <div><span>Datos recibidos</span><strong>${s.receivedPct!=null?`${a(s.receivedPct,1)} %`:"\u2014"}</strong></div>
    <div><span>Datos aceptados</span><strong>${s.validPct!=null?`${a(s.validPct,1)} %`:"\u2014"}</strong></div>
    <div><span>Aceptadas</span><strong>${s.valid} (${s.invalid} inv\xE1lidas)</strong></div>
    <div><span>Faltantes por tiempo</span><strong>${s.timeMissing??"\u2014"}</strong></div>
  </div>`,n=e.dewPoint,d=`<p class="coverage">Punto de roc\xEDo: <strong>${a(n.value,1)} \xB0C</strong> <span class="badge badge-muted">Calculado</span>${n.count?` \xB7 m\xEDn ${a(n.min,1)} / m\xE1x ${a(n.max,1)} \xB0C en el periodo`:""}</p>
    <p class="hint">${t(n.method)} ${(n.limitations||[]).map(t).join(" ")}</p>`,r=e.aemet.comparison,c=r.matched?`<div class="fact-grid">
        <div><span>Lecturas comparables (menos de ${r.windowMinutes} min)</span><strong>${r.matched}</strong></div>
        <div><span>Diferencia media</span><strong>${a(r.differences.avg,2)} \xB0C</strong></div>
        <div><span>Rango de diferencia</span><strong>${a(r.differences.min,1)} \u2026 ${a(r.differences.max,1)} \xB0C</strong></div>
      </div><p class="hint">La diferencia es la medida de tu estaci\xF3n menos la de la oficial. Proveedor AEMET \xB7 estaci\xF3n ${t(e.aemet.stationId||"\u2014")} \xB7 \xFAltima observaci\xF3n ${t(p(e.aemet.lastObservedAt))}.</p>`:`<p class="empty">Sin lecturas de AEMET comparables en el periodo (${e.aemet.observations} observaciones disponibles).</p>`;return`
    ${o}
    <h3>Res\xFAmenes diarios \xB7 temperatura</h3>
    ${u(e.weekly.dailyTemperature,"\xB0C",1)}
    <h3>Punto de roc\xEDo <span class="badge badge-muted">Calculado</span></h3>
    ${d}
    <h3>Comparaci\xF3n hist\xF3rica con AEMET <span class="badge badge-muted">Fuente externa</span></h3>
    ${c}
    <p class="hint">${(e.limits||[]).map(t).join(" ")}</p>
    ${$()}`}export{l as demoMetricCard,f as renderDemoDetails,b as renderDemoOverview};
