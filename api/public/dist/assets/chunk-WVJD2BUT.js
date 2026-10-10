import{a as q,d as U}from"./chunk-NURGKUAA.js";import"./chunk-QJKFD42P.js";import{c as H}from"./chunk-QRUPGFUF.js";import"./chunk-NHDGTPCS.js";import"./chunk-Z4YXSH7B.js";import"./chunk-3GDF57X5.js";import{E as V,b as N,c as _,d,e as b,h as $,i as C,m as y,n as w,o as O,p as j,r as I,s as T,t as L,x as P}from"./chunk-G5CTXHV7.js";var S={solicitado:["Solicitado","state-requested"],recibido:["Recibido","state-received"],aplicado:["Aplicado","state-applied"]},K=[["interval_normal_s","Medir cada","s"],["sync_interval_s","Enviar cada","s"],["battery_low_mv","Bater\xEDa baja","mV"],["battery_critical_mv","Bater\xEDa cr\xEDtica","mV"]];async function k(r,p){let i=await y(`/api/v1/stations/${encodeURIComponent(p)}/config`),[a,g]=S[i.state]??S.solicitado,o=i.effectiveConfig||{},u=i.history?.[0]?.changes||{},s=Object.entries(u);r.innerHTML=`<section class="panel">
    <div class="section-heading">
      <div><p class="eyebrow">CONFIGURACI\xD3N DEL EQUIPO</p><h2>Versi\xF3n ${i.version} \xB7 <span class="badge ${g}">${a}</span></h2></div>
      <a class="button-link" href="#/estaciones/${encodeURIComponent(p)}/remoto">Control remoto del dispositivo</a>
    </div>
    ${i.timeline?`<ol class="stepper compact">
      ${["solicitado","recibido","aplicado"].map(l=>{let t=i.timeline[l]??{done:!1,at:null},[e]=S[l];return`<li class="${t.done?"done":""} ${i.state===l?"current":""}">
          <span class="step-dot">${t.done?"\u2713":""}</span>
          <strong>${e}</strong>
          ${t.at?`<time>${b(t.at)}</time>`:""}
        </li>`}).join("")}
    </ol>`:""}
    <p class="coverage">Firmware ${d(i.firmware?.reported||i.firmware?.declared||"sin registrar")} \xB7
      equipo en v${i.deviceConfigVersion??0} \xB7 \xFAltimo contacto ${b(i.lastContact)}</p>
    ${i.warnings?.length?`<div class="warn-box">${i.warnings.map(l=>`<p><strong>${d(l.key)}</strong>: ${d(l.message)}</p>`).join("")}</div>`:""}
    <div class="fact-grid">
      ${K.map(([l,t,e])=>`<div><span>${d(t)}</span>
        <strong>${$(o[l],0)} ${e}</strong></div>`).join("")}
    </div>
    ${s.length?`<h3>Cambios de la v${i.version}</h3><ul class="diff">${s.map(([l,t])=>`<li><code>${d(l)}</code>: ${d(JSON.stringify(t.from))} \u2192 <strong>${d(JSON.stringify(t.to))}</strong></li>`).join("")}</ul>`:""}
    ${w()&&i.state!=="aplicado"?`<div class="row-actions"><button type="button" data-confirm="${i.version}">Confirmar aplicaci\xF3n</button>
         <a class="button-link" href="#/estaciones/${encodeURIComponent(p)}/remoto">Cambiar par\xE1metros</a></div>`:""}
  </section>
  <section class="panel">
    <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Versiones aplicadas</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Versi\xF3n</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Confirmaci\xF3n</th><th>Cambios</th><th></th></tr></thead>
      <tbody>${(i.history||[]).map(l=>{let[t,e]=S[l.state]??S.solicitado,n=Object.entries(l.changes||{});return`<tr>
          <td>v${l.version}${l.version===i.version?' <span class="badge badge-valid">actual</span>':""}</td>
          <td>${b(l.createdAt)}</td>
          <td>${d(l.changedByEmail||"\u2014")}</td>
          <td>${d(l.changeReason||"\u2014")}</td>
          <td><span class="badge ${e}">${t}</span>${l.appliedHint?"<br><small>con datos posteriores</small>":""}</td>
          <td>${l.confirmedVersion?`confirmada ${b(l.appliedAt)}`:"sin confirmar"}</td>
          <td>${n.length?`<ul class="diff">${n.map(([m,v])=>`<li><code>${d(m)}</code>: ${d(JSON.stringify(v.from))} \u2192 <strong>${d(JSON.stringify(v.to))}</strong></li>`).join("")}</ul>`:'<span class="empty">sin cambios</span>'}</td>
          <td class="row-actions">${w()&&!l.confirmedVersion&&l.version===i.version?`<button type="button" data-confirm="${l.version}">Confirmar</button>`:""}</td>
        </tr>`}).join("")||'<tr><td colspan="8">Sin versiones registradas.</td></tr>'}</tbody>
    </table></div>
  </section>`,r.onclick=async l=>{let t=l.target.closest("button[data-confirm]");if(t)try{await y(`/api/v1/stations/${encodeURIComponent(p)}/config/${t.dataset.confirm}/confirm`,{method:"POST",body:JSON.stringify({})}),await k(r,p)}catch(e){let n=_("[data-error]",r);n&&(n.textContent=`No se pudo confirmar: ${e.message}`)}}}var B={solicitado:["Solicitado","state-requested"],recibido:["Recibido por la estaci\xF3n","state-received"],aplicado:["Aplicado","state-applied"]};function Q(r,p,i){return`<ol class="stepper">${[["solicitado","Solicitado","Guardada por el administrador"],["recibido","Recibido","La estaci\xF3n la pidi\xF3 al servidor"],["aplicado","Aplicado","La estaci\xF3n declara tenerla aplicada"]].map(([g,o,u])=>{let s=r?.[g]??{done:!1,at:null},l=s.done;return`<li class="${l?"done":""} ${p===g?"current":""}">
      <span class="step-dot">${l?"\u2713":""}</span>
      <strong>${o}</strong>
      <small>${u}</small>
      ${s.at?`<time>${b(s.at)}</time>`:""}
    </li>`}).join("")}</ol>
  ${p!=="aplicado"&&i?'<p class="hint">La estaci\xF3n envi\xF3 datos despu\xE9s de pedir esta versi\xF3n: es un indicio, no una confirmaci\xF3n. Sigue pendiente hasta que el equipo declare la versi\xF3n aplicada.</p>':""}`}function Z(r,p,i){return`<div class="remote-facts">
    <div><span>Versi\xF3n de firmware</span><strong>${d(r.reported||r.declared||"sin registrar")}</strong>
      ${r.reported?"<small>confirmada por el equipo</small>":"<small>declarada en la ficha; el firmware actual no la transmite</small>"}</div>
    <div><span>Configuraci\xF3n en el equipo</span><strong>v${p}</strong>
      <small>${p?"\xFAltima confirmada":"sin confirmar"}</small></div>
    <div><span>\xDAltimo contacto</span><strong>${b(i)}</strong><small>el equipo no est\xE1 siempre conectado</small></div>
  </div>`}function Y(r,p,i,a,g){let o=Object.entries(p).filter(([,s])=>s.group===r.id);if(!o.length)return"";let u=r.firmware==="pending"||o.every(([s])=>g.includes(s));return`<fieldset class="config-group" data-group="${r.id}">
    <legend>${d(r.label)}${u?' <span class="badge badge-muted">reservado</span>':""}</legend>
    <p class="hint">${d(r.hint)}</p>
    <div class="form-grid">
      ${o.map(([s,l])=>{let t=i[s],e=a[s],n=s==="pressure_alert_low_pa",m=n?"mbar":l.unit,v=n?t==null?t:t/100:t,f=n?e/100:e,c=n?l.min/100:l.min,x=n?l.max/100:l.max,E=n?1:l.step??1;if(l.kind==="boolean")return`<label class="check">${d(l.label)}
            <input type="checkbox" data-key="${s}" ${t??e?"checked":""} ${w()?"":"disabled"}></label>`;let M=t===void 0?`placeholder="del equipo: ${f} ${m}"`:"";return`<label>${d(l.label)} ${g.includes(s)?'<span class="badge badge-muted">reservado</span>':""}
          <input type="number" data-key="${s}" step="${E}" min="${c}" max="${x}"
            value="${v??""}" ${M} ${w()?"":"disabled"}>
          <small>permitido ${c}\u2013${x} ${d(m)}</small></label>`}).join("")}
    </div>
  </fieldset>`}function W(r,p){return r.length?`<div class="table-wrap"><table>
    <thead><tr><th>Versi\xF3n</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Cambios</th><th></th></tr></thead>
    <tbody>${r.map(i=>{let[a,g]=B[i.state]??B.solicitado,o=Object.entries(i.changes||{}),u=w()&&!i.confirmedVersion&&i.version===p;return`<tr>
        <td>v${i.version}${i.version===p?' <span class="badge badge-valid">actual</span>':""}</td>
        <td>${b(i.createdAt)}</td>
        <td>${d(i.changedByEmail||"\u2014")}</td>
        <td>${d(i.changeReason||"\u2014")}</td>
        <td><span class="badge ${g}">${a}</span>${i.appliedHint?"<br><small>con datos posteriores</small>":""}</td>
        <td>${o.length?`<ul class="diff">${o.map(([s,l])=>{let t=e=>s==="pressure_alert_low_pa"&&e!=null?`${$(e/100,1)} mbar`:JSON.stringify(e);return`<li><code>${d(s)}</code>: ${d(t(l.from))} \u2192 <strong>${d(t(l.to))}</strong></li>`}).join("")}</ul>`:'<span class="empty">sin cambios</span>'}</td>
        <td class="row-actions">${u?`<button type="button" data-confirm="${i.version}">Confirmar aplicaci\xF3n</button>`:""}</td>
      </tr>`}).join("")}</tbody>
  </table></div>`:'<p class="empty">Sin versiones registradas.</p>'}async function R(r,p,i){let a=await y(`/api/v1/stations/${encodeURIComponent(p)}/config`),g=a.allowedKeys||{},o=a.groups||[],u=a.pendingFirmwareKeys||[],s=a.effectiveConfig?.interval_normal_s,l=a.effectiveConfig?.sync_interval_s;r.innerHTML=`
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones/${encodeURIComponent(p)}">\u2190 ${d(i.name)}</a></p>
        <h1>Control remoto del dispositivo</h1>
        <p class="updated">Los cambios no son inmediatos: el equipo est\xE1 dormido y solo los aplica cuando vuelve a
          despertar, como muy tarde en su pr\xF3ximo env\xEDo (cada ${d($(l,0))} s ahora mismo).</p>
      </div>
      <div class="station-tags"><span class="badge badge-muted">Config v${a.version}</span></div>
    </div>
    <p class="error" data-error role="alert"></p>
    ${Z(a.firmware||{},a.deviceConfigVersion??0,a.lastContact)}
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CICLO DEL CAMBIO</p><h2>Estado de la versi\xF3n ${a.version}</h2></div></div>
      ${Q(a.timeline,a.state,a.appliedHint)}
      ${w()&&a.state!=="aplicado"?`<div class="row-actions"><button type="button" data-confirm="${a.version}">Registrar que la estaci\xF3n la aplic\xF3</button></div>`:'<p class="hint">La estaci\xF3n declar\xF3 esta versi\xF3n aplicada. No hay acci\xF3n pendiente.</p>'}
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PAR\xC1METROS</p><h2>Valores de la estaci\xF3n</h2></div>
        <p class="coverage">Medici\xF3n cada ${d($(s,0))} s \xB7 env\xEDo cada ${d($(l,0))} s</p></div>
      ${a.warnings?.length?`<div class="warn-box">${a.warnings.map(n=>`<p><strong>${d(n.key)}</strong>: ${d(n.message)}</p>`).join("")}</div>`:""}
      <form data-config-form>
        ${o.map(n=>Y(n,g,a.config||{},a.defaults||{},u)).join("")}
        <p class="hint">Un campo vac\xEDo deja la clave sin definir y el equipo vuelve a su valor de f\xE1brica.
          Los l\xEDmites son los que admite el firmware: si un valor no fuera aplicable, la estaci\xF3n descartar\xEDa la configuraci\xF3n entera.</p>
        <p class="error" data-form-error role="alert"></p>
        ${w()?'<button type="submit">Guardar nueva versi\xF3n</button>':'<p class="empty">Tu rol es de solo lectura: puedes consultar los valores pero no cambiarlos.</p>'}
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Qui\xE9n cambi\xF3 qu\xE9</h2></div></div>
      ${W(a.history||[],a.version)}
    </section>
    <section class="panel">
      <p class="hint">No hay acciones inmediatas a prop\xF3sito: el equipo no mantiene la conexi\xF3n abierta, as\xED que el
        servidor no puede despertarlo. En LoRa el mismo pendiente de configuraci\xF3n sirve igual.</p>
    </section>`;let t=n=>{_("[data-error]",r).textContent=n||""};r.onclick=async n=>{let m=n.target.closest("button[data-confirm]");if(!m)return;let v=m.dataset.confirm,f=window.prompt("Nota de la confirmaci\xF3n (opcional):","aplicada por el equipo")||void 0;try{await y(`/api/v1/stations/${encodeURIComponent(p)}/config/${v}/confirm`,{method:"POST",body:JSON.stringify(f?{reason:f}:{})}),await R(r,p,i)}catch(c){t(`No se pudo confirmar: ${c.message}`)}};let e=_("[data-config-form]",r);e&&(e.onsubmit=async n=>{n.preventDefault(),_("[data-form-error]",r).textContent="";let m={};for(let f of e.querySelectorAll("[data-key]")){let c=f.dataset.key,x=g[c];if(x)if(x.kind==="boolean")m[c]=f.checked;else{let E=f.value===""?null:Number(f.value);m[c]=c==="pressure_alert_low_pa"&&E!=null?Math.round(E*100):E}}let v=window.prompt("Motivo del cambio (queda en el historial):","ajuste desde control remoto")||void 0;try{let f=await y(`/api/v1/stations/${encodeURIComponent(p)}/config`,{method:"PUT",body:JSON.stringify({config:m,...v?{reason:v}:{}})});f.warnings?.length&&(_("[data-form-error]",r).textContent=`Guardado como v${f.version}. Ojo: ${f.warnings.map(c=>c.message).join(" ")}`),await R(r,p,i)}catch(f){_("[data-form-error]",r).textContent=`No se pudo guardar: ${f.message}`}})}var X={sube:"sube",baja:"baja",estable:"estable",insuficiente:"sin datos suficientes"},F={sube:"#a13333",baja:"#4286a8",estable:"#5d6f62",insuficiente:"#8a938c"};async function z(r,p,i){let a=new Date,g=new Date(a.getTime()-168*3600*1e3),[o,u]=await Promise.all([y(`/api/v1/stations/${encodeURIComponent(p)}/statistics?from=${g.toISOString()}&to=${a.toISOString()}`),y(`/api/v1/stations/${encodeURIComponent(p)}/urgent-impact`).catch(()=>null)]),s=o.coverage,l=Object.entries(o.metrics).map(([v,f])=>{let c=v==="pressure_pa"?{...f,unit:"mbar",digits:1,min:C(f.min),max:C(f.max),avg:C(f.avg),stddev:C(f.stddev),p10:C(f.p10),p50:C(f.p50),p90:C(f.p90),trend:f.trend?{...f.trend,slopePerHour:C(f.trend.slopePerHour),totalChange:C(f.trend.totalChange)}:f.trend}:f;return`
    <div class="stat-card">
      <p class="eyebrow">${j[c.label]?`<span class="metric-icon">${N(j[c.label],{size:18})}</span>`:""}${d(c.label)} <small>${d(c.unit)}</small></p>
      <div class="stat-row">
        <span>M\xEDn</span><strong>${$(c.min,c.digits??1)}</strong>
        <span>M\xE1x</span><strong>${$(c.max,c.digits??1)}</strong>
        <span>Media</span><strong>${$(c.avg,c.digits??1)}</strong>
      </div>
      <div class="stat-row">
        <span>Mediana</span><strong>${$(c.p50,c.digits??1)}</strong>
        <span>Desv.</span><strong>${$(c.stddev,c.digits??1)}</strong>
        <span>Muestras</span><strong>${c.count}</strong>
      </div>
      <p class="trend trend-${d(c.trend.direction)}" style="--trend-color:${F[c.trend.direction]||F.insuficiente}">
        ${c.trend.direction==="sube"?"\u2191 ":c.trend.direction==="baja"?"\u2193 ":c.trend.direction==="estable"?"\u2192 ":"\xB7 "}
        Tendencia ${d(X[c.trend.direction]||c.trend.direction)}
        ${c.trend.slopePerHour!=null?` \xB7 ${$(c.trend.slopePerHour,3)} ${d(c.unit)}/h`:""}
      </p>
    </div>`}).join(""),t=Object.entries(o.metrics).map(([v,f])=>{let c=f.dixonQ;if(!c)return"";let x=v==="pressure_pa",E=c.suspectedValue==null?"\u2014":x?`${$(C(c.suspectedValue),1)} mbar`:`${$(c.suspectedValue,f.digits??1)} ${f.unit}`,M=c.status==="possible_outlier"?"Extremo a revisar":c.status==="no_outlier"?"Sin at\xEDpico detectado":c.status==="no_variation"?"Serie constante":"Muestras insuficientes",G=c.status==="possible_outlier"?"badge badge-warn":"badge badge-muted";return`<article class="dixon-card">
      <div class="dixon-card-head"><strong>${d(f.label)}</strong><span class="${G}">${M}</span></div>
      <div class="dixon-result"><span>Q observada</span><strong>${$(c.q,3)}</strong><span>Q cr\xEDtica 95 %</span><strong>${$(c.criticalQ,3)}</strong></div>
      <p>${c.status==="possible_outlier"?`Posible valor extremo (${c.side}): ${E} \xB7 ${b(c.suspectedAt)}.`:`Muestras evaluadas: ${c.n} de hasta ${c.sampleLimit}.`}</p>
    </article>`}).join(""),e=o.series.map(v=>`<tr>
    <td>${b(v.at)}</td><td>${v.count}</td>
    <td>${$(v.temperatureAvg)}</td><td>${$(v.humidityAvg)}</td>
  </tr>`).join(""),n=o.series.filter(v=>v.temperatureAvg!=null).map(v=>({observedAt:v.at,temperatureC:v.temperatureAvg})),m=u?`
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">ALERTA URGENTE</p><h2>Coste de env\xEDo inmediato</h2></div>
        ${u.pending?`<span class="badge badge-warn">${u.pending} pendiente(s)</span>`:""}</div>
      <p class="coverage">Con lotes cada ${$(u.delay.syncIntervalS,0)} s, un aviso urgente llega como muy tarde
        ese tiempo despu\xE9s de la medida. Una alerta de helada no puede esperar a media hora.</p>
      <div class="fact-grid">
        <div><span>Env\xEDos urgentes</span><strong>${u.impact.urgentEvents}</strong></div>
        <div><span>Medidos</span><strong>${u.impact.measuredEvents}</strong></div>
        <div><span>Gasto de fondo</span><strong>${u.impact.baselineMvPerHour!=null?`${$(u.impact.baselineMvPerHour,2)} mV/h`:"\u2014"}</strong></div>
        <div><span>Coste extra por evento</span><strong>${u.impact.extraDropMvPerUrgentEvent!=null?`${$(u.impact.extraDropMvPerUrgentEvent,1)} mV`:"\u2014"}</strong></div>
        <div><span>Consumo extra diario</span><strong>${u.impact.estimatedExtraDrainMvPerDay!=null?`${$(u.impact.estimatedExtraDrainMvPerDay,1)} mV`:"\u2014"}</strong></div>
      </div>
      <p class="${u.impact.sufficiency==="suficiente"?"hint":"warn-box"}">${d(u.impact.note)}</p>
      <p class="hint">El firmware actual todav\xEDa no aplica la directiva: se mide sobre env\xEDos reales antes de
        decidir si compensa el gasto. Con LoRa el mismo pendiente sigue siendo v\xE1lido.</p>
    </section>`:"";r.innerHTML=`
    <section class="panel">
      <div class="section-heading">
        <div><p class="eyebrow">ESTAD\xCDSTICAS</p><h2>${d(i.name)} \xB7 \xFAltimos ${o.hours>=48?`${Math.round(o.hours/24)} d\xEDas`:`${o.hours} h`}</h2></div>
        <p class="coverage">${b(o.from)} \u2192 ${b(o.to)} \xB7 ${o.samples} medidas aceptadas por controles autom\xE1ticos</p>
      </div>
      <p class="hint">${T(i?.verification)} \xABAceptada por los controles autom\xE1ticos\xBB (rango, marcas y hora) no es \xABverificada frente a una referencia\xBB. Este informe usa lo primero.</p>
      <div class="fact-grid">
        <div><span>Recibidos</span><strong>${s.received}</strong></div>
        <div><span>Esperados</span><strong>${s.expected??"\u2014"}</strong></div>
        <div><span>Cobertura de recibidas</span><strong>${s.receivedPct!=null?`${$(s.receivedPct,1)} %`:"\u2014"}</strong></div>
        <div><span>Cobertura de aceptadas</span><strong>${s.validPct!=null?`${$(s.validPct,1)} %`:"\u2014"}</strong></div>
        <div><span>Aceptadas</span><strong>${s.valid} (${s.invalid} inv\xE1lidas)</strong></div>
        <div><span>Avisos del periodo</span><strong>${o.alerts.total}${o.alerts.open?` \xB7 ${o.alerts.open} abiertos`:""}</strong></div>
      </div>
      ${s.expected&&s.receivedPct!=null&&s.receivedPct<90?`<div class="warn-box"><p>Ha llegado el ${$(s.receivedPct,1)} % de las medidas previstas
            (intervalo configurado ${$(s.intervalSeconds,0)} s). Faltan ${s.missing}.</p></div>`:""}
      <div class="stat-grid">${l}</div>
      <section class="dixon-analysis" aria-labelledby="dixon-heading">
        <div class="dixon-heading"><div><p class="eyebrow">CONTROL ESTAD\xCDSTICO \xB7 ADMINISTRACI\xD3N</p><h3 id="dixon-heading">Valores at\xEDpicos \xB7 Q de Dixon</h3></div><span class="badge badge-muted">95 % \xB7 \u03B1 = 0,05</span></div>
        <p class="hint">Eval\xFAa el valor m\xEDnimo o m\xE1ximo m\xE1s extremo de las \xFAltimas 30 mediciones aceptadas por variable. Es una se\xF1al para revisar, no elimina ni invalida datos autom\xE1ticamente.</p>
        <div class="dixon-grid">${t}</div>
      </section>
      <p class="hint">${(o.limits||[]).map(v=>d(v)).join(" ")}</p>
    </section>
    ${n.length>1?`<section class="panel"><h3>Evoluci\xF3n por bloques de ${o.bucketHours} h</h3>
      ${V("Temperatura media",n,"temperatureC","#d47749","\xB0C")}</section>`:""}
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">DETALLE</p><h2>Valores por bloque</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Bloque</th><th>Muestras</th><th>Temp. media</th><th>Humedad media</th></tr></thead>
        <tbody>${e||'<tr><td colspan="4">Sin datos en el periodo.</td></tr>'}</tbody>
      </table></div>
    </section>
    ${m}
    ${w()?"":'<p class="empty">Tu rol es de solo lectura.</p>'}`}var A=[["temperature","Temperatura"],["humidity","Humedad"],["pressure","Presi\xF3n"],["battery","Bater\xEDa"],["lux","Lux"]],h=(r,p,i="")=>`<label>${p}<input name="${r}" ${i}></label>`;function J(r){let p=r.elements.public_zone.value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();/(^|\W)huescar(\W|$)/.test(p)&&(r.elements.aemet_municipality_code.value||(r.elements.aemet_municipality_code.value="18098"),r.elements.aemet_station_id.value||(r.elements.aemet_station_id.value="5051X"))}async function be(r){r.innerHTML=`
    <div class="page-heading">
      <div><p class="eyebrow">ESTACIONES</p><h1>Estaciones vinculadas</h1></div>
      ${w()?'<button type="button" data-new>Nueva estaci\xF3n</button>':""}
    </div>
    <p class="error" data-error role="alert"></p>
    <div data-list class="station-list"></div>
    <section class="panel hidden" data-form-panel>
      <div class="section-heading">
        <div><p class="eyebrow">FICHA DE ESTACI\xD3N</p><h2 data-form-title>Nueva estaci\xF3n</h2></div>
        <button type="button" class="quiet" data-cancel>Cancelar</button>
      </div>
      <form data-station-form class="station-form">
        <div class="form-grid">
          ${h("id","Identificador del equipo",'data-create-only maxlength="80" placeholder="esp32c3-01"')}
          ${h("name","Nombre p\xFAblico",'required maxlength="120"')}
          ${h("owner","Propietario o responsable",'maxlength="200"')}
          <label>Emplazamiento<select name="location_type">
            <option value="finca">Finca</option><option value="urbano">Urbano</option><option value="otro">Otro</option>
          </select></label>
          ${h("public_zone","Localidad o zona de referencia",'maxlength="200"')}
          <label>Latitud (privada)<input name="latitude" type="number" step="any" min="-90" max="90"></label>
          <label>Longitud (privada)<input name="longitude" type="number" step="any" min="-180" max="180"></label>
          ${h("aemet_municipality_code","C\xF3digo de municipio AEMET",'inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="opcional"')}
          ${h("aemet_station_id","Indicativo estaci\xF3n observadora AEMET",'maxlength="5" placeholder="opcional"')}
          ${h("aemet_warning_area","\xC1rea de avisos AEMET",'maxlength="12" placeholder="opcional"')}
          ${h("altitude","Altitud (m)",'type="number" step="1" min="-500" max="9000"')}
          ${h("installation_date","Fecha de instalaci\xF3n",'type="date"')}
          ${h("firmware_version","Versi\xF3n de firmware",'maxlength="60"')}
          ${h("coverage_km","Cobertura (km)",'type="number" step="0.1" min="0.1" max="500" placeholder="25"')}
        </div>
        <p class="hint">Open-Meteo usa las coordenadas autom\xE1ticamente. Para AEMET, a\xF1ade el c\xF3digo municipal, el indicativo de la estaci\xF3n observadora m\xE1s cercana y el \xE1rea de avisos; la API key debe estar guardada como variable privada AEMET_API_KEY en el servidor. Para Hu\xE9scar se sugieren el municipio 18098 y la estaci\xF3n observadora 5051X.</p>
        <fieldset class="sensor-set"><legend>Sensores activos</legend>${A.map(([t,e])=>`<label class="check"><input type="checkbox" name="sensor_${t}" checked> ${e}</label>`).join("")}</fieldset>
        <fieldset class="sensor-set"><legend>Documentaci\xF3n del emplazamiento</legend>
          <div class="form-grid">
            ${h("site_sensor_model","Modelo de sensor",'maxlength="160"')}
            ${h("site_shelter","Garita o abrigo",'maxlength="160"')}
            ${h("site_height_m","Altura del sensor (m)",'type="number" step="0.1"')}
            ${h("site_ventilation","Ventilaci\xF3n",'maxlength="200"')}
            ${h("site_orientation","Orientaci\xF3n",'maxlength="160"')}
            ${h("site_power","Alimentaci\xF3n",'maxlength="160"')}
            ${h("site_notes","Notas del emplazamiento",'maxlength="1000"')}
          </div>
          <p class="hint">Documentar el montaje (sensor, abrigo, altura, ventilaci\xF3n, orientaci\xF3n y alimentaci\xF3n) permite interpretar la medida; no la convierte en exacta.</p>
        </fieldset>
        <fieldset class="sensor-set"><legend>Verificaci\xF3n frente a referencia</legend>
          <label>Estado<select name="verification_status">
            <option value="unverified">Sin verificar</option>
            <option value="pending">Verificaci\xF3n pendiente</option>
            <option value="verified">Verificada frente a referencia</option>
          </select></label>
          <div class="form-grid">
            ${h("verification_reference","Referencia usada",'maxlength="200" placeholder="patr\xF3n, estaci\xF3n oficial..."')}
            ${h("verification_method","M\xE9todo",'maxlength="600"')}
            ${h("verification_date","Fecha de verificaci\xF3n",'type="date"')}
            ${h("verification_error","Error observado",'maxlength="300" placeholder="p. ej. \xB10,4 \xB0C frente al patr\xF3n"')}
            ${h("verification_bias","Sesgo observado",'maxlength="300"')}
            ${h("verification_tolerance","Tolerancia acordada",'maxlength="300" placeholder="la define el equipo"')}
            ${h("verification_conditions","Condiciones",'maxlength="500"')}
            ${h("verification_limitations","Limitaciones",'maxlength="1000"')}
            ${h("verification_responsible","Responsable",'maxlength="200"')}
          </div>
          <p class="hint">La tolerancia y el error dependen del modelo y del uso acordado: este formulario registra lo medido, no fija umbrales. Los controles autom\xE1ticos de rango no sustituyen esta prueba.</p>
        </fieldset>
        <div class="form-grid">
          <label class="check"><input type="checkbox" name="publish_permission"> Permitir datos p\xFAblicos agregados</label>
          <label class="check"><input type="checkbox" name="active" checked data-edit-only> Estaci\xF3n activa</label>
        </div>
        <p class="hint" data-catalog></p>
        <p class="error" data-form-error role="alert"></p>
        <button type="submit">Guardar estaci\xF3n</button>
      </form>
    </section>`;let p=_("[data-list]",r),i=_("[data-form-panel]",r),a=_("[data-station-form]",r),g=_("[data-form-error]",r),o=null;y("/api/v1/stations/sensors-catalog").then(({sensors:t})=>{_("[data-catalog]",r).textContent=`Cat\xE1logo de sensores: ${t.map(e=>`${e.name} (${e.id==="pressure"?"mbar":e.unit})`).join(" \xB7 ")}. La disponibilidad por estaci\xF3n se ajusta con las casillas anteriores.`}).catch(()=>{});async function u(){_("[data-error]",r).textContent="";try{let{stations:t}=await y("/api/v1/stations");p.innerHTML=t.length?t.map(e=>{let n=e.status||{},m=[e.owner,e.publicZone,P(e.locationType),e.altitude==null?null:`${e.altitude} m`,`${$(e.coverageKm,1)} km de cobertura`].filter(Boolean).join(" \xB7 "),v=[`<a class="button-link" href="#/estaciones/${encodeURIComponent(e.id)}">Detalle</a>`,w()?`<button type="button" data-edit="${d(e.id)}">Editar</button>`:"",O()&&e.active?`<button type="button" class="danger" data-deactivate="${d(e.id)}">Desactivar</button>`:""].join(" ");return`<article class="station-card">
          <div class="station-head">
            <div><p class="eyebrow">${d(e.id)}</p>
              <h2><a href="#/estaciones/${encodeURIComponent(e.id)}">${d(e.name)}</a></h2>
              <p class="updated">${d(m)}</p></div>
            <div class="station-tags">
              ${e.active?I(n.connectivity):'<span class="badge badge-muted">Desactivada</span>'}
              ${n.dataFreshness==="stale"?'<span class="badge badge-warn">Datos antiguos</span>':n.dataFreshness==="unknown"?'<span class="badge badge-muted">Sin datos v\xE1lidos</span>':""}
              ${e.publishPermission?'<span class="badge badge-muted">Datos p\xFAblicos</span>':""}
              ${T(e.verification)}
            </div>
          </div>
          <p class="coverage">\xDAltimo contacto: ${b(n.lastContact)} \xB7 \xFAltimo dato v\xE1lido: ${b(n.lastValidData)} \xB7 ${e.sensors?.battery===!1?"bater\xEDa: sensor desactivado":`bater\xEDa ${$(n.batteryMv,0)} mV (${L(n.batteryLevel)})`} \xB7 configuraci\xF3n v${n.configVersion}</p>
          <div class="row-actions">${v}</div>
        </article>`}).join(""):'<section class="panel"><p class="empty">Tu suscripci\xF3n a\xFAn no tiene estaciones vinculadas.</p></section>'}catch(t){_("[data-error]",r).textContent=`No se pudieron cargar las estaciones: ${t.message}`}}function s(t=null){if(o=t,g.textContent="",_("[data-form-title]",r).textContent=t?`Editar ${t.name}`:"Nueva estaci\xF3n",a.reset(),r.querySelectorAll("[data-create-only]").forEach(n=>n.classList.toggle("hidden",!!t)),r.querySelectorAll("[data-edit-only]").forEach(n=>n.classList.toggle("hidden",!t)),t){a.elements.name.value=t.name,a.elements.owner.value=t.owner??"",a.elements.location_type.value=t.locationType??"finca",a.elements.latitude.value=t.latitude??"",a.elements.longitude.value=t.longitude??"",a.elements.public_zone.value=t.publicZone??"",a.elements.aemet_municipality_code.value=t.aemetMunicipalityCode??"",a.elements.aemet_station_id.value=t.aemetStationId??"",a.elements.aemet_warning_area.value=t.aemetWarningArea??"",a.elements.altitude.value=t.altitude??"",a.elements.installation_date.value=t.installationDate??"",a.elements.firmware_version.value=t.firmwareVersion??"",a.elements.coverage_km.value=t.coverageKm??"",a.elements.publish_permission.checked=!!t.publishPermission,a.elements.active.checked=!!t.active;let n=t.siteInfo||{};a.elements.site_sensor_model.value=n.sensor_model??"",a.elements.site_shelter.value=n.shelter??"",a.elements.site_height_m.value=n.height_m??"",a.elements.site_ventilation.value=n.ventilation??"",a.elements.site_orientation.value=n.orientation??"",a.elements.site_power.value=n.power??"",a.elements.site_notes.value=n.notes??"";let m=t.verification||{};a.elements.verification_status.value=m.status??"unverified",a.elements.verification_reference.value=m.reference??"",a.elements.verification_method.value=m.method??"",a.elements.verification_date.value=m.date??"",a.elements.verification_error.value=m.error??"",a.elements.verification_bias.value=m.bias??"",a.elements.verification_tolerance.value=m.tolerance??"",a.elements.verification_conditions.value=m.conditions??"",a.elements.verification_limitations.value=m.limitations??"",a.elements.verification_responsible.value=m.responsible??""}else a.elements.location_type.value="finca",a.elements.verification_status.value="unverified",A.forEach(([n])=>{a.elements[`sensor_${n}`].checked=n!=="lux"}),a.elements.active.checked=!0;J(a);let e={...t?.sensors||{}};A.forEach(([n])=>{t&&(a.elements[`sensor_${n}`].checked=e[n]!==!1)}),i.classList.remove("hidden"),p.classList.add("hidden"),i.scrollIntoView({behavior:"smooth",block:"start"})}a.elements.public_zone.addEventListener("input",()=>J(a));function l(){i.classList.add("hidden"),p.classList.remove("hidden"),o=null}r.onclick=async t=>{let e=t.target.closest("button, a");if(e){if(e.dataset.new!==void 0){s();return}if(e.dataset.cancel!==void 0){l();return}if(e.dataset.edit){let{stations:n}=await y("/api/v1/stations"),m=n.find(v=>v.id===e.dataset.edit);m&&s(m);return}if(e.dataset.deactivate){let n=e.dataset.deactivate;if(!window.confirm(`\xBFDesactivar la estaci\xF3n ${n}? Dejar\xE1 de admitir datos.`))return;try{await y(`/api/v1/stations/${encodeURIComponent(n)}`,{method:"DELETE"}),await u()}catch(m){_("[data-error]",r).textContent=`No se pudo desactivar: ${m.message}`}}}},a.addEventListener("submit",async t=>{t.preventDefault(),g.textContent="";let e=v=>a.elements[v].value.trim(),n=v=>e(v)===""?null:Number(e(v)),m={name:e("name"),owner:e("owner")||null,location_type:e("location_type"),latitude:n("latitude"),longitude:n("longitude"),public_zone:e("public_zone")||null,aemet_municipality_code:e("aemet_municipality_code")||null,aemet_station_id:e("aemet_station_id")||null,aemet_warning_area:e("aemet_warning_area")||null,altitude:n("altitude"),installation_date:e("installation_date")||null,firmware_version:e("firmware_version")||null,publish_permission:a.elements.publish_permission.checked,sensors:Object.fromEntries(A.map(([v])=>[v,a.elements[`sensor_${v}`].checked])),site_info:{sensor_model:e("site_sensor_model")||null,shelter:e("site_shelter")||null,height_m:n("site_height_m"),ventilation:e("site_ventilation")||null,orientation:e("site_orientation")||null,power:e("site_power")||null,notes:e("site_notes")||null},verification:{status:e("verification_status")||"unverified",reference:e("verification_reference")||null,method:e("verification_method")||null,date:e("verification_date")||null,error:e("verification_error")||null,bias:e("verification_bias")||null,tolerance:e("verification_tolerance")||null,conditions:e("verification_conditions")||null,limitations:e("verification_limitations")||null,responsible:e("verification_responsible")||null}};e("coverage_km")!==""&&(m.coverage_km=Number(e("coverage_km")));try{o?(m.active=a.elements.active.checked,await y(`/api/v1/stations/${encodeURIComponent(o.id)}`,{method:"PATCH",body:JSON.stringify(m)})):(m.id=e("id"),m.active=a.elements.active.checked,await y("/api/v1/stations",{method:"POST",body:JSON.stringify(m)})),l(),await u()}catch(v){g.textContent=`No se pudo guardar: ${v.message}`}}),await u()}var D=[["resumen","Resumen"],["estado","Estado"],["config","Configuraci\xF3n"],["mediciones","Mediciones"],["avisos","Avisos"],["estadisticas","Estad\xEDsticas"]];async function ee(r,p){let i=new Date,a=new Date(i.getTime()-168*3600*1e3),[g,o]=await Promise.all([y("/api/v1/dashboard?period=24h"),y(`/api/v1/stations/${encodeURIComponent(p)}/measurements/gaps?from=${a.toISOString()}&to=${i.toISOString()}`)]),u=(g.devices||[]).find(s=>s.device.id===p);r.innerHTML=u?`${U(u)}<section class="panel"><div class="section-heading"><div>
        <p class="eyebrow">COBERTURA</p><h2>Integridad de la serie (7 d\xEDas)</h2></div></div>
        <p class="coverage">Periodo solicitado ${b(o.requested?.from)} \u2192 ${b(o.requested?.to)} \xB7
          con datos ${o.available?.from?`${b(o.available.from)} \u2192 ${b(o.available.to)}`:"sin datos"} \xB7
          denominador desde ${o.denominator?.basis==="installation_date"?"la fecha de instalaci\xF3n":"la primera medici\xF3n"} (${b(o.service?.from)})${o.truncatedToNow?` \xB7 <strong>cobertura evaluada hasta el ${b(o.evaluated?.to)}</strong>, no hasta el final del periodo pedido`:""}</p>
        <p class="coverage">Recibidas ${o.received} \xB7 aceptadas ${o.valid} \xB7 inv\xE1lidas ${o.invalid} \xB7
          esperadas por tiempo ${o.expected??"\u2014"} \xB7 faltan por tiempo ${o.timeMissing??"\u2014"} \xB7
          cobertura de recibidas ${o.receivedPct??"\u2014"} % \xB7 de aceptadas ${o.validPct??"\u2014"} %</p>
        <p class="coverage">Huecos de secuencia: ${o.sequence?.gaps?.length??0} (${o.sequence?.total??0} muestras) \xB7
          reinicios de secuencia: ${o.sequence?.resets?.length??0} \xB7
          ausencia al inicio: ${o.leadingMissing??0} \xB7 al final: ${o.trailingMissing??0}</p>
        <p class="hint">El denominador son las muestras esperadas entre la puesta en servicio y el final del periodo
          evaluado, con las cadencias que la estaci\xF3n tuvo activas. Si el periodo pedido llega m\xE1s all\xE1 de ahora,
          el futuro no se cuenta: no puede restar fiabilidad a una estaci\xF3n. Los huecos de secuencia son saltos
          del contador del equipo: no equivalen a las muestras ausentes por tiempo.</p>
        ${o.gaps.length?`<div class="table-wrap"><table><thead><tr><th>Secuencia desde</th><th>Secuencia hasta</th><th>Muestras</th></tr></thead><tbody>${o.gaps.map(s=>`<tr><td>${d(s.gapFrom)}</td><td>${d(s.gapTo)}</td><td>${d(s.missing)}</td></tr>`).join("")}</tbody></table></div>`:'<p class="empty">No se detectan huecos de secuencia en el periodo.</p>'}
      </section>`:'<section class="panel"><p class="empty">La estaci\xF3n no aparece en el panel (puede estar desactivada o sin acceso).</p></section>'}function ae(r,p){let i=p.station,a=p.status,g=p.measurementStats||{},o=A.map(([m,v])=>{let f=i.sensors?.[m]===!1;return`<li>${v}: ${f?"desactivado, no se mide":"activo"}</li>`}).join(""),u=i.siteInfo||{},s=i.verification||{},l=s.status==="verified"?`verificada frente a referencia${s.reference?` (${s.reference})`:""}${s.date?` el ${s.date}`:""}`:s.status==="pending"?"verificaci\xF3n pendiente":"sin verificar frente a referencia",t=[["Identificador",i.id],["Propietario",i.owner],["Emplazamiento",P(i.locationType)],["Zona p\xFAblica",i.publicZone],["Ubicaci\xF3n privada",i.latitude==null?"sin coordenadas":`${i.latitude}, ${i.longitude}`],["Altitud",i.altitude==null?"\u2014":`${i.altitude} m`],["Instalaci\xF3n",b(i.installationDate)],["Cobertura",`${$(i.coverageKm,1)} km`],["Firmware",i.firmwareVersion],["Modelo de sensor",u.sensor_model],["Garita o abrigo",u.shelter],["Altura del sensor",u.height_m==null?null:`${$(u.height_m,1)} m`],["Ventilaci\xF3n",u.ventilation],["Orientaci\xF3n",u.orientation],["Alimentaci\xF3n",u.power],["Notas del emplazamiento",u.notes],["Verificaci\xF3n",l],["Referencia de verificaci\xF3n",s.reference],["M\xE9todo de verificaci\xF3n",s.method],["Error observado",s.error],["Sesgo observado",s.bias],["Tolerancia acordada",s.tolerance],["Condiciones de verificaci\xF3n",s.conditions],["Limitaciones de verificaci\xF3n",s.limitations],["Responsable de verificaci\xF3n",s.responsible],["Permiso de publicaci\xF3n",i.publishPermission?"concedido":"no concedido"],["Alta en el sistema",b(i.createdAt)],["Connectividad",a.connectivity],["\xDAltimo contacto",b(a.lastContact)],["\xDAltimo dato v\xE1lido",b(a.lastValidData)],["Bater\xEDa",i.sensors?.battery===!1?"sensor desactivado":a.batteryMv==null?"no medida":`${$(a.batteryMv,0)} mV (${L(a.batteryLevel)})`],["Configuraci\xF3n aplicada",`v${a.configVersion}`],["Muestras pendientes",a.pendingSamples],["Mediciones",`${g.valid??0} v\xE1lidas de ${g.total??0} \xB7 \xFAltima ${b(g.lastObserved)}`],["Reglas de aviso",p.alertRuleCount],["Versiones de configuraci\xF3n",p.configVersionCount]],e=new Set(["Configuraci\xF3n aplicada","Muestras pendientes","Reglas de aviso","Versiones de configuraci\xF3n"]),n=w()?t:t.filter(([m])=>!e.has(m));r.innerHTML=`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">ESTADO OPERATIVO</p><h2>Ficha t\xE9cnica y de estado</h2></div>
      ${w()?'<a class="button-link" href="#/estaciones">Editar desde el listado</a>':""}</div>
    <dl class="detail-grid">${n.map(([m,v])=>`<dt>${m}</dt><dd>${d(v??"\u2014")}</dd>`).join("")}</dl>
    <h3>Sensores</h3><ul class="plain-list">${o}</ul>
    <p class="hint">Los sensores desactivados no aparecen en el resumen ni tienen gr\xE1fica: el equipo no env\xEDa esa magnitud. Viento y precipitaci\xF3n los aporta AEMET; la radiaci\xF3n UV no se mide hoy.</p>
  </section>`}async function he(r,p,i="resumen"){let a=await y(`/api/v1/stations/${encodeURIComponent(p)}`),g=a.station,o=a.status||{},u=O()?D:w()?D.filter(([e])=>e!=="estadisticas"):D.filter(([e])=>["resumen","estado","mediciones","avisos"].includes(e)),s=u.some(([e])=>e===i)?i:"resumen",l=e=>`#/estaciones/${encodeURIComponent(g.id)}/${e}`;if(i==="remoto"&&w()){await R(r,g.id,g);return}r.innerHTML=`
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones">Estaciones</a> \xB7 ${d(g.id)}</p>
        <h1>${d(g.name)}</h1>
        <p class="updated">${d([g.owner,g.publicZone].filter(Boolean).join(" \xB7 ")||"Sin propietario registrado")}</p>
      </div>
      <div class="station-tags">
        ${g.active?I(o.connectivity):'<span class="badge badge-muted">Desactivada</span>'}
        ${w()?`<span class="badge badge-muted">Config v${o.configVersion??0}</span>`:""}
        <span class="badge badge-muted">${L(o.batteryLevel)}</span>
        ${T(g.verification)}
        ${w()?`<a class="button-link" href="#/estaciones/${encodeURIComponent(g.id)}/remoto">Control remoto</a>`:""}
      </div>
    </div>
    <nav class="tabs">${u.map(([e,n])=>`<a href="${l(e)}" class="${e===s?"active":""}">${n}</a>`).join("")}</nav>
    <div data-tab-content></div>`;let t=_("[data-tab-content]",r);s==="resumen"?await ee(t,g.id):s==="estado"?ae(t,a):s==="config"?await k(t,g.id):s==="mediciones"?(t.innerHTML='<section class="panel"></section>',q(_("section",t),{fixedStation:g.id})):s==="estadisticas"?await z(t,g.id,g):await H(t,g.id)}export{he as renderStationDetail,be as renderStations};
