import{a as P,d as V}from"./chunk-6CSTBKJD.js";import"./chunk-OXQONG4P.js";import{c as U}from"./chunk-4QSGPST6.js";import"./chunk-4L6TDCRN.js";import"./chunk-ZWOJUT3D.js";import{a as h,b as r,c as f,e as $,f as C,j as y,k as w,l as O,m as j,o as k,p as A,t as D,z as N}from"./chunk-6I6L4YVC.js";var T={solicitado:["Solicitado","state-requested"],recibido:["Recibido","state-received"],aplicado:["Aplicado","state-applied"]},J=[["interval_normal_s","Medir cada","s"],["sync_interval_s","Enviar cada","s"],["battery_low_mv","Bater\xEDa baja","mV"],["battery_critical_mv","Bater\xEDa cr\xEDtica","mV"]];async function I(n,p){let s=await y(`/api/v1/stations/${encodeURIComponent(p)}/config`),[t,m]=T[s.state]??T.solicitado,c=s.effectiveConfig||{},v=s.history?.[0]?.changes||{},d=Object.entries(v);n.innerHTML=`<section class="panel">
    <div class="section-heading">
      <div><p class="eyebrow">CONFIGURACI\xD3N DEL EQUIPO</p><h2>Versi\xF3n ${s.version} \xB7 <span class="badge ${m}">${t}</span></h2></div>
      <a class="button-link" href="#/estaciones/${encodeURIComponent(p)}/remoto">Control remoto del dispositivo</a>
    </div>
    ${s.timeline?`<ol class="stepper compact">
      ${["solicitado","recibido","aplicado"].map(o=>{let a=s.timeline[o]??{done:!1,at:null},[e]=T[o];return`<li class="${a.done?"done":""} ${s.state===o?"current":""}">
          <span class="step-dot">${a.done?"\u2713":""}</span>
          <strong>${e}</strong>
          ${a.at?`<time>${f(a.at)}</time>`:""}
        </li>`}).join("")}
    </ol>`:""}
    <p class="coverage">Firmware ${r(s.firmware?.reported||s.firmware?.declared||"sin registrar")} \xB7
      equipo en v${s.deviceConfigVersion??0} \xB7 \xFAltimo contacto ${f(s.lastContact)}</p>
    ${s.warnings?.length?`<div class="warn-box">${s.warnings.map(o=>`<p><strong>${r(o.key)}</strong>: ${r(o.message)}</p>`).join("")}</div>`:""}
    <div class="fact-grid">
      ${J.map(([o,a,e])=>`<div><span>${r(a)}</span>
        <strong>${$(c[o],0)} ${e}</strong></div>`).join("")}
    </div>
    ${d.length?`<h3>Cambios de la v${s.version}</h3><ul class="diff">${d.map(([o,a])=>`<li><code>${r(o)}</code>: ${r(JSON.stringify(a.from))} \u2192 <strong>${r(JSON.stringify(a.to))}</strong></li>`).join("")}</ul>`:""}
    ${w()&&s.state!=="aplicado"?`<div class="row-actions"><button type="button" data-confirm="${s.version}">Confirmar aplicaci\xF3n</button>
         <a class="button-link" href="#/estaciones/${encodeURIComponent(p)}/remoto">Cambiar par\xE1metros</a></div>`:""}
  </section>
  <section class="panel">
    <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Versiones aplicadas</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Versi\xF3n</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Confirmaci\xF3n</th><th>Cambios</th><th></th></tr></thead>
      <tbody>${(s.history||[]).map(o=>{let[a,e]=T[o.state]??T.solicitado,i=Object.entries(o.changes||{});return`<tr>
          <td>v${o.version}${o.version===s.version?' <span class="badge badge-valid">actual</span>':""}</td>
          <td>${f(o.createdAt)}</td>
          <td>${r(o.changedByEmail||"\u2014")}</td>
          <td>${r(o.changeReason||"\u2014")}</td>
          <td><span class="badge ${e}">${a}</span>${o.appliedHint?"<br><small>con datos posteriores</small>":""}</td>
          <td>${o.confirmedVersion?`confirmada ${f(o.appliedAt)}`:"sin confirmar"}</td>
          <td>${i.length?`<ul class="diff">${i.map(([b,u])=>`<li><code>${r(b)}</code>: ${r(JSON.stringify(u.from))} \u2192 <strong>${r(JSON.stringify(u.to))}</strong></li>`).join("")}</ul>`:'<span class="empty">sin cambios</span>'}</td>
          <td class="row-actions">${w()&&!o.confirmedVersion&&o.version===s.version?`<button type="button" data-confirm="${o.version}">Confirmar</button>`:""}</td>
        </tr>`}).join("")||'<tr><td colspan="8">Sin versiones registradas.</td></tr>'}</tbody>
    </table></div>
  </section>`,n.onclick=async o=>{let a=o.target.closest("button[data-confirm]");if(a)try{await y(`/api/v1/stations/${encodeURIComponent(p)}/config/${a.dataset.confirm}/confirm`,{method:"POST",body:JSON.stringify({})}),await I(n,p)}catch(e){let i=h("[data-error]",n);i&&(i.textContent=`No se pudo confirmar: ${e.message}`)}}}var q={solicitado:["Solicitado","state-requested"],recibido:["Recibido por la estaci\xF3n","state-received"],aplicado:["Aplicado","state-applied"]};function G(n,p,s){return`<ol class="stepper">${[["solicitado","Solicitado","Guardada por el administrador"],["recibido","Recibido","La estaci\xF3n la pidi\xF3 al servidor"],["aplicado","Aplicado","La estaci\xF3n declara tenerla aplicada"]].map(([m,c,v])=>{let d=n?.[m]??{done:!1,at:null},o=d.done;return`<li class="${o?"done":""} ${p===m?"current":""}">
      <span class="step-dot">${o?"\u2713":""}</span>
      <strong>${c}</strong>
      <small>${v}</small>
      ${d.at?`<time>${f(d.at)}</time>`:""}
    </li>`}).join("")}</ol>
  ${p!=="aplicado"&&s?'<p class="hint">La estaci\xF3n envi\xF3 datos despu\xE9s de pedir esta versi\xF3n: es un indicio, no una confirmaci\xF3n. Sigue pendiente hasta que el equipo declare la versi\xF3n aplicada.</p>':""}`}function K(n,p,s){return`<div class="remote-facts">
    <div><span>Versi\xF3n de firmware</span><strong>${r(n.reported||n.declared||"sin registrar")}</strong>
      ${n.reported?"<small>confirmada por el equipo</small>":"<small>declarada en la ficha; el firmware actual no la transmite</small>"}</div>
    <div><span>Configuraci\xF3n en el equipo</span><strong>v${p}</strong>
      <small>${p?"\xFAltima confirmada":"sin confirmar"}</small></div>
    <div><span>\xDAltimo contacto</span><strong>${f(s)}</strong><small>el equipo no est\xE1 siempre conectado</small></div>
  </div>`}function Q(n,p,s,t,m){let c=Object.entries(p).filter(([,d])=>d.group===n.id);if(!c.length)return"";let v=n.firmware==="pending"||c.every(([d])=>m.includes(d));return`<fieldset class="config-group" data-group="${n.id}">
    <legend>${r(n.label)}${v?' <span class="badge badge-muted">reservado</span>':""}</legend>
    <p class="hint">${r(n.hint)}</p>
    <div class="form-grid">
      ${c.map(([d,o])=>{let a=s[d],e=t[d],i=d==="pressure_alert_low_pa",b=i?"mbar":o.unit,u=i?a==null?a:a/100:a,g=i?e/100:e,l=i?o.min/100:o.min,x=i?o.max/100:o.max,E=i?1:o.step??1;if(o.kind==="boolean")return`<label class="check">${r(o.label)}
            <input type="checkbox" data-key="${d}" ${a??e?"checked":""} ${w()?"":"disabled"}></label>`;let R=a===void 0?`placeholder="del equipo: ${g} ${b}"`:"";return`<label>${r(o.label)} ${m.includes(d)?'<span class="badge badge-muted">reservado</span>':""}
          <input type="number" data-key="${d}" step="${E}" min="${l}" max="${x}"
            value="${u??""}" ${R} ${w()?"":"disabled"}>
          <small>permitido ${l}\u2013${x} ${r(b)}</small></label>`}).join("")}
    </div>
  </fieldset>`}function Z(n,p){return n.length?`<div class="table-wrap"><table>
    <thead><tr><th>Versi\xF3n</th><th>Fecha</th><th>Autor</th><th>Motivo</th><th>Estado</th><th>Cambios</th><th></th></tr></thead>
    <tbody>${n.map(s=>{let[t,m]=q[s.state]??q.solicitado,c=Object.entries(s.changes||{}),v=w()&&!s.confirmedVersion&&s.version===p;return`<tr>
        <td>v${s.version}${s.version===p?' <span class="badge badge-valid">actual</span>':""}</td>
        <td>${f(s.createdAt)}</td>
        <td>${r(s.changedByEmail||"\u2014")}</td>
        <td>${r(s.changeReason||"\u2014")}</td>
        <td><span class="badge ${m}">${t}</span>${s.appliedHint?"<br><small>con datos posteriores</small>":""}</td>
        <td>${c.length?`<ul class="diff">${c.map(([d,o])=>{let a=e=>d==="pressure_alert_low_pa"&&e!=null?`${$(e/100,1)} mbar`:JSON.stringify(e);return`<li><code>${r(d)}</code>: ${r(a(o.from))} \u2192 <strong>${r(a(o.to))}</strong></li>`}).join("")}</ul>`:'<span class="empty">sin cambios</span>'}</td>
        <td class="row-actions">${v?`<button type="button" data-confirm="${s.version}">Confirmar aplicaci\xF3n</button>`:""}</td>
      </tr>`}).join("")}</tbody>
  </table></div>`:'<p class="empty">Sin versiones registradas.</p>'}async function L(n,p,s){let t=await y(`/api/v1/stations/${encodeURIComponent(p)}/config`),m=t.allowedKeys||{},c=t.groups||[],v=t.pendingFirmwareKeys||[],d=t.effectiveConfig?.interval_normal_s,o=t.effectiveConfig?.sync_interval_s;n.innerHTML=`
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones/${encodeURIComponent(p)}">\u2190 ${r(s.name)}</a></p>
        <h1>Control remoto del dispositivo</h1>
        <p class="updated">Los cambios no son inmediatos: el equipo est\xE1 dormido y solo los aplica cuando vuelve a
          despertar, como muy tarde en su pr\xF3ximo env\xEDo (cada ${r($(o,0))} s ahora mismo).</p>
      </div>
      <div class="station-tags"><span class="badge badge-muted">Config v${t.version}</span></div>
    </div>
    <p class="error" data-error role="alert"></p>
    ${K(t.firmware||{},t.deviceConfigVersion??0,t.lastContact)}
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CICLO DEL CAMBIO</p><h2>Estado de la versi\xF3n ${t.version}</h2></div></div>
      ${G(t.timeline,t.state,t.appliedHint)}
      ${w()&&t.state!=="aplicado"?`<div class="row-actions"><button type="button" data-confirm="${t.version}">Registrar que la estaci\xF3n la aplic\xF3</button></div>`:'<p class="hint">La estaci\xF3n declar\xF3 esta versi\xF3n aplicada. No hay acci\xF3n pendiente.</p>'}
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PAR\xC1METROS</p><h2>Valores de la estaci\xF3n</h2></div>
        <p class="coverage">Medici\xF3n cada ${r($(d,0))} s \xB7 env\xEDo cada ${r($(o,0))} s</p></div>
      ${t.warnings?.length?`<div class="warn-box">${t.warnings.map(i=>`<p><strong>${r(i.key)}</strong>: ${r(i.message)}</p>`).join("")}</div>`:""}
      <form data-config-form>
        ${c.map(i=>Q(i,m,t.config||{},t.defaults||{},v)).join("")}
        <p class="hint">Un campo vac\xEDo deja la clave sin definir y el equipo vuelve a su valor de f\xE1brica.
          Los l\xEDmites son los que admite el firmware: si un valor no fuera aplicable, la estaci\xF3n descartar\xEDa la configuraci\xF3n entera.</p>
        <p class="error" data-form-error role="alert"></p>
        ${w()?'<button type="submit">Guardar nueva versi\xF3n</button>':'<p class="empty">Tu rol es de solo lectura: puedes consultar los valores pero no cambiarlos.</p>'}
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Qui\xE9n cambi\xF3 qu\xE9</h2></div></div>
      ${Z(t.history||[],t.version)}
    </section>
    <section class="panel">
      <p class="hint">No hay acciones inmediatas a prop\xF3sito: el equipo no mantiene la conexi\xF3n abierta, as\xED que el
        servidor no puede despertarlo. En LoRa el mismo pendiente de configuraci\xF3n sirve igual.</p>
    </section>`;let a=i=>{h("[data-error]",n).textContent=i||""};n.onclick=async i=>{let b=i.target.closest("button[data-confirm]");if(!b)return;let u=b.dataset.confirm,g=window.prompt("Nota de la confirmaci\xF3n (opcional):","aplicada por el equipo")||void 0;try{await y(`/api/v1/stations/${encodeURIComponent(p)}/config/${u}/confirm`,{method:"POST",body:JSON.stringify(g?{reason:g}:{})}),await L(n,p,s)}catch(l){a(`No se pudo confirmar: ${l.message}`)}};let e=h("[data-config-form]",n);e&&(e.onsubmit=async i=>{i.preventDefault(),h("[data-form-error]",n).textContent="";let b={};for(let g of e.querySelectorAll("[data-key]")){let l=g.dataset.key,x=m[l];if(x)if(x.kind==="boolean")b[l]=g.checked;else{let E=g.value===""?null:Number(g.value);b[l]=l==="pressure_alert_low_pa"&&E!=null?Math.round(E*100):E}}let u=window.prompt("Motivo del cambio (queda en el historial):","ajuste desde control remoto")||void 0;try{let g=await y(`/api/v1/stations/${encodeURIComponent(p)}/config`,{method:"PUT",body:JSON.stringify({config:b,...u?{reason:u}:{}})});g.warnings?.length&&(h("[data-form-error]",n).textContent=`Guardado como v${g.version}. Ojo: ${g.warnings.map(l=>l.message).join(" ")}`),await L(n,p,s)}catch(g){h("[data-form-error]",n).textContent=`No se pudo guardar: ${g.message}`}})}var Y={sube:"sube",baja:"baja",estable:"estable",insuficiente:"sin datos suficientes"},H={sube:"#a13333",baja:"#4286a8",estable:"#5d6f62",insuficiente:"#8a938c"};async function F(n,p,s){let t=new Date,m=new Date(t.getTime()-168*3600*1e3),[c,v]=await Promise.all([y(`/api/v1/stations/${encodeURIComponent(p)}/statistics?from=${m.toISOString()}&to=${t.toISOString()}`),y(`/api/v1/stations/${encodeURIComponent(p)}/urgent-impact`).catch(()=>null)]),d=c.coverage,o=Object.entries(c.metrics).map(([u,g])=>{let l=u==="pressure_pa"?{...g,unit:"mbar",digits:1,min:C(g.min),max:C(g.max),avg:C(g.avg),stddev:C(g.stddev),p10:C(g.p10),p50:C(g.p50),p90:C(g.p90),trend:g.trend?{...g.trend,slopePerHour:C(g.trend.slopePerHour),totalChange:C(g.trend.totalChange)}:g.trend}:g;return`
    <div class="stat-card">
      <p class="eyebrow">${j[l.label]?`<span class="metric-icon" aria-hidden="true">${j[l.label]} </span>`:""}${r(l.label)} <small>${r(l.unit)}</small></p>
      <div class="stat-row">
        <span>M\xEDn</span><strong>${$(l.min,l.digits??1)}</strong>
        <span>M\xE1x</span><strong>${$(l.max,l.digits??1)}</strong>
        <span>Media</span><strong>${$(l.avg,l.digits??1)}</strong>
      </div>
      <div class="stat-row">
        <span>Mediana</span><strong>${$(l.p50,l.digits??1)}</strong>
        <span>Desv.</span><strong>${$(l.stddev,l.digits??1)}</strong>
        <span>Muestras</span><strong>${l.count}</strong>
      </div>
      <p class="trend trend-${r(l.trend.direction)}" style="--trend-color:${H[l.trend.direction]||H.insuficiente}">
        ${l.trend.direction==="sube"?"\u2191 ":l.trend.direction==="baja"?"\u2193 ":l.trend.direction==="estable"?"\u2192 ":"\xB7 "}
        Tendencia ${r(Y[l.trend.direction]||l.trend.direction)}
        ${l.trend.slopePerHour!=null?` \xB7 ${$(l.trend.slopePerHour,3)} ${r(l.unit)}/h`:""}
      </p>
    </div>`}).join(""),a=Object.entries(c.metrics).map(([u,g])=>{let l=g.dixonQ;if(!l)return"";let x=u==="pressure_pa",E=l.suspectedValue==null?"\u2014":x?`${$(C(l.suspectedValue),1)} mbar`:`${$(l.suspectedValue,g.digits??1)} ${g.unit}`,R=l.status==="possible_outlier"?"Extremo a revisar":l.status==="no_outlier"?"Sin at\xEDpico detectado":l.status==="no_variation"?"Serie constante":"Muestras insuficientes",z=l.status==="possible_outlier"?"badge badge-warn":"badge badge-muted";return`<article class="dixon-card">
      <div class="dixon-card-head"><strong>${r(g.label)}</strong><span class="${z}">${R}</span></div>
      <div class="dixon-result"><span>Q observada</span><strong>${$(l.q,3)}</strong><span>Q cr\xEDtica 95 %</span><strong>${$(l.criticalQ,3)}</strong></div>
      <p>${l.status==="possible_outlier"?`Posible valor extremo (${l.side}): ${E} \xB7 ${f(l.suspectedAt)}.`:`Muestras evaluadas: ${l.n} de hasta ${l.sampleLimit}.`}</p>
    </article>`}).join(""),e=c.series.map(u=>`<tr>
    <td>${f(u.at)}</td><td>${u.count}</td>
    <td>${$(u.temperatureAvg)}</td><td>${$(u.humidityAvg)}</td>
  </tr>`).join(""),i=c.series.filter(u=>u.temperatureAvg!=null).map(u=>({observedAt:u.at,temperatureC:u.temperatureAvg})),b=v?`
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">ALERTA URGENTE</p><h2>Coste de env\xEDo inmediato</h2></div>
        ${v.pending?`<span class="badge badge-warn">${v.pending} pendiente(s)</span>`:""}</div>
      <p class="coverage">Con lotes cada ${$(v.delay.syncIntervalS,0)} s, un aviso urgente llega como muy tarde
        ese tiempo despu\xE9s de la medida. Una alerta de helada no puede esperar a media hora.</p>
      <div class="fact-grid">
        <div><span>Env\xEDos urgentes</span><strong>${v.impact.urgentEvents}</strong></div>
        <div><span>Medidos</span><strong>${v.impact.measuredEvents}</strong></div>
        <div><span>Gasto de fondo</span><strong>${v.impact.baselineMvPerHour!=null?`${$(v.impact.baselineMvPerHour,2)} mV/h`:"\u2014"}</strong></div>
        <div><span>Coste extra por evento</span><strong>${v.impact.extraDropMvPerUrgentEvent!=null?`${$(v.impact.extraDropMvPerUrgentEvent,1)} mV`:"\u2014"}</strong></div>
        <div><span>Consumo extra diario</span><strong>${v.impact.estimatedExtraDrainMvPerDay!=null?`${$(v.impact.estimatedExtraDrainMvPerDay,1)} mV`:"\u2014"}</strong></div>
      </div>
      <p class="${v.impact.sufficiency==="suficiente"?"hint":"warn-box"}">${r(v.impact.note)}</p>
      <p class="hint">El firmware actual todav\xEDa no aplica la directiva: se mide sobre env\xEDos reales antes de
        decidir si compensa el gasto. Con LoRa el mismo pendiente sigue siendo v\xE1lido.</p>
    </section>`:"";n.innerHTML=`
    <section class="panel">
      <div class="section-heading">
        <div><p class="eyebrow">ESTAD\xCDSTICAS</p><h2>${r(s.name)} \xB7 \xFAltimos ${c.hours>=48?`${Math.round(c.hours/24)} d\xEDas`:`${c.hours} h`}</h2></div>
        <p class="coverage">${f(c.from)} \u2192 ${f(c.to)} \xB7 ${c.samples} medidas validadas</p>
      </div>
      <div class="fact-grid">
        <div><span>Recibidos</span><strong>${d.received}</strong></div>
        <div><span>Esperados</span><strong>${d.expected??"\u2014"}</strong></div>
        <div><span>Cobertura</span><strong>${d.receivedPct!=null?`${$(d.receivedPct,1)} %`:"\u2014"}</strong></div>
        <div><span>V\xE1lidos</span><strong>${d.valid} (${d.invalid} inv\xE1lidos)</strong></div>
        <div><span>Avisos del periodo</span><strong>${c.alerts.total}${c.alerts.open?` \xB7 ${c.alerts.open} abiertos`:""}</strong></div>
      </div>
      ${d.expected&&d.receivedPct!=null&&d.receivedPct<90?`<div class="warn-box"><p>Ha llegado el ${$(d.receivedPct,1)} % de las medidas previstas
            (intervalo configurado ${$(d.intervalSeconds,0)} s). Faltan ${d.missing}.</p></div>`:""}
      <div class="stat-grid">${o}</div>
      <section class="dixon-analysis" aria-labelledby="dixon-heading">
        <div class="dixon-heading"><div><p class="eyebrow">CONTROL ESTAD\xCDSTICO \xB7 ADMINISTRACI\xD3N</p><h3 id="dixon-heading">Valores at\xEDpicos \xB7 Q de Dixon</h3></div><span class="badge badge-muted">95 % \xB7 \u03B1 = 0,05</span></div>
        <p class="hint">Eval\xFAa el valor m\xEDnimo o m\xE1ximo m\xE1s extremo de las \xFAltimas 30 mediciones validadas por variable. Es una se\xF1al para revisar, no elimina ni invalida datos autom\xE1ticamente.</p>
        <div class="dixon-grid">${a}</div>
      </section>
      <p class="hint">${(c.limits||[]).map(u=>r(u)).join(" ")}</p>
    </section>
    ${i.length>1?`<section class="panel"><h3>Evoluci\xF3n por bloques de ${c.bucketHours} h</h3>
      ${N("Temperatura media",i,"temperatureC","#d47749","\xB0C")}</section>`:""}
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">DETALLE</p><h2>Valores por bloque</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Bloque</th><th>Muestras</th><th>Temp. media</th><th>Humedad media</th></tr></thead>
        <tbody>${e||'<tr><td colspan="4">Sin datos en el periodo.</td></tr>'}</tbody>
      </table></div>
    </section>
    ${b}
    ${w()?"":'<p class="empty">Tu rol es de solo lectura.</p>'}`}var S=[["temperature","Temperatura"],["humidity","Humedad"],["pressure","Presi\xF3n"],["battery","Bater\xEDa"],["lux","Lux"]],_=(n,p,s="")=>`<label>${p}<input name="${n}" ${s}></label>`;function B(n){let p=n.elements.public_zone.value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();/(^|\W)huescar(\W|$)/.test(p)&&(n.elements.aemet_municipality_code.value||(n.elements.aemet_municipality_code.value="18098"),n.elements.aemet_station_id.value||(n.elements.aemet_station_id.value="5051X"))}async function ge(n){n.innerHTML=`
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
          ${_("id","Identificador del equipo",'data-create-only maxlength="80" placeholder="esp32c3-01"')}
          ${_("name","Nombre p\xFAblico",'required maxlength="120"')}
          ${_("owner","Propietario o responsable",'maxlength="200"')}
          <label>Emplazamiento<select name="location_type">
            <option value="finca">Finca</option><option value="urbano">Urbano</option><option value="otro">Otro</option>
          </select></label>
          ${_("public_zone","Localidad o zona de referencia",'maxlength="200"')}
          <label>Latitud (privada)<input name="latitude" type="number" step="any" min="-90" max="90"></label>
          <label>Longitud (privada)<input name="longitude" type="number" step="any" min="-180" max="180"></label>
          ${_("aemet_municipality_code","C\xF3digo de municipio AEMET",'inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="opcional"')}
          ${_("aemet_station_id","Indicativo estaci\xF3n observadora AEMET",'maxlength="5" placeholder="opcional"')}
          ${_("aemet_warning_area","\xC1rea de avisos AEMET",'maxlength="12" placeholder="opcional"')}
          ${_("altitude","Altitud (m)",'type="number" step="1" min="-500" max="9000"')}
          ${_("installation_date","Fecha de instalaci\xF3n",'type="date"')}
          ${_("firmware_version","Versi\xF3n de firmware",'maxlength="60"')}
          ${_("coverage_km","Cobertura (km)",'type="number" step="0.1" min="0.1" max="500" placeholder="25"')}
        </div>
        <p class="hint">Open-Meteo usa las coordenadas autom\xE1ticamente. Para AEMET, a\xF1ade el c\xF3digo municipal, el indicativo de la estaci\xF3n observadora m\xE1s cercana y el \xE1rea de avisos; la API key debe estar guardada como variable privada AEMET_API_KEY en el servidor. Para Hu\xE9scar se sugieren el municipio 18098 y la estaci\xF3n observadora 5051X.</p>
        <fieldset class="sensor-set"><legend>Sensores activos</legend>${S.map(([a,e])=>`<label class="check"><input type="checkbox" name="sensor_${a}" checked> ${e}</label>`).join("")}</fieldset>
        <div class="form-grid">
          <label class="check"><input type="checkbox" name="publish_permission"> Permitir datos p\xFAblicos agregados</label>
          <label class="check"><input type="checkbox" name="active" checked data-edit-only> Estaci\xF3n activa</label>
        </div>
        <p class="hint" data-catalog></p>
        <p class="error" data-form-error role="alert"></p>
        <button type="submit">Guardar estaci\xF3n</button>
      </form>
    </section>`;let p=h("[data-list]",n),s=h("[data-form-panel]",n),t=h("[data-station-form]",n),m=h("[data-form-error]",n),c=null;y("/api/v1/stations/sensors-catalog").then(({sensors:a})=>{h("[data-catalog]",n).textContent=`Cat\xE1logo de sensores: ${a.map(e=>`${e.name} (${e.id==="pressure"?"mbar":e.unit})`).join(" \xB7 ")}. La disponibilidad por estaci\xF3n se ajusta con las casillas anteriores.`}).catch(()=>{});async function v(){h("[data-error]",n).textContent="";try{let{stations:a}=await y("/api/v1/stations");p.innerHTML=a.length?a.map(e=>{let i=e.status||{},b=[e.owner,e.publicZone,D(e.locationType),e.altitude==null?null:`${e.altitude} m`,`${$(e.coverageKm,1)} km de cobertura`].filter(Boolean).join(" \xB7 "),u=[`<a class="button-link" href="#/estaciones/${encodeURIComponent(e.id)}">Detalle</a>`,w()?`<button type="button" data-edit="${r(e.id)}">Editar</button>`:"",O()&&e.active?`<button type="button" class="danger" data-deactivate="${r(e.id)}">Desactivar</button>`:""].join(" ");return`<article class="station-card">
          <div class="station-head">
            <div><p class="eyebrow">${r(e.id)}</p>
              <h2><a href="#/estaciones/${encodeURIComponent(e.id)}">${r(e.name)}</a></h2>
              <p class="updated">${r(b)}</p></div>
            <div class="station-tags">
              ${e.active?k(i.connectivity):'<span class="badge badge-muted">Desactivada</span>'}
              ${i.dataFreshness==="stale"?'<span class="badge badge-warn">Datos antiguos</span>':i.dataFreshness==="unknown"?'<span class="badge badge-muted">Sin datos v\xE1lidos</span>':""}
              ${e.publishPermission?'<span class="badge badge-muted">Datos p\xFAblicos</span>':""}
            </div>
          </div>
          <p class="coverage">\xDAltimo contacto: ${f(i.lastContact)} \xB7 \xFAltimo dato v\xE1lido: ${f(i.lastValidData)} \xB7 bater\xEDa ${$(i.batteryMv,0)} mV (${A(i.batteryLevel)}) \xB7 configuraci\xF3n v${i.configVersion}</p>
          <div class="row-actions">${u}</div>
        </article>`}).join(""):'<section class="panel"><p class="empty">Tu suscripci\xF3n a\xFAn no tiene estaciones vinculadas.</p></section>'}catch(a){h("[data-error]",n).textContent=`No se pudieron cargar las estaciones: ${a.message}`}}function d(a=null){c=a,m.textContent="",h("[data-form-title]",n).textContent=a?`Editar ${a.name}`:"Nueva estaci\xF3n",t.reset(),n.querySelectorAll("[data-create-only]").forEach(i=>i.classList.toggle("hidden",!!a)),n.querySelectorAll("[data-edit-only]").forEach(i=>i.classList.toggle("hidden",!a)),a?(t.elements.name.value=a.name,t.elements.owner.value=a.owner??"",t.elements.location_type.value=a.locationType??"finca",t.elements.latitude.value=a.latitude??"",t.elements.longitude.value=a.longitude??"",t.elements.public_zone.value=a.publicZone??"",t.elements.aemet_municipality_code.value=a.aemetMunicipalityCode??"",t.elements.aemet_station_id.value=a.aemetStationId??"",t.elements.aemet_warning_area.value=a.aemetWarningArea??"",t.elements.altitude.value=a.altitude??"",t.elements.installation_date.value=a.installationDate??"",t.elements.firmware_version.value=a.firmwareVersion??"",t.elements.coverage_km.value=a.coverageKm??"",t.elements.publish_permission.checked=!!a.publishPermission,t.elements.active.checked=!!a.active):(t.elements.location_type.value="finca",S.forEach(([i])=>{t.elements[`sensor_${i}`].checked=i!=="lux"}),t.elements.active.checked=!0),B(t);let e={...a?.sensors||{}};S.forEach(([i])=>{a&&(t.elements[`sensor_${i}`].checked=e[i]!==!1)}),s.classList.remove("hidden"),p.classList.add("hidden"),s.scrollIntoView({behavior:"smooth",block:"start"})}t.elements.public_zone.addEventListener("input",()=>B(t));function o(){s.classList.add("hidden"),p.classList.remove("hidden"),c=null}n.onclick=async a=>{let e=a.target.closest("button, a");if(e){if(e.dataset.new!==void 0){d();return}if(e.dataset.cancel!==void 0){o();return}if(e.dataset.edit){let{stations:i}=await y("/api/v1/stations"),b=i.find(u=>u.id===e.dataset.edit);b&&d(b);return}if(e.dataset.deactivate){let i=e.dataset.deactivate;if(!window.confirm(`\xBFDesactivar la estaci\xF3n ${i}? Dejar\xE1 de admitir datos.`))return;try{await y(`/api/v1/stations/${encodeURIComponent(i)}`,{method:"DELETE"}),await v()}catch(b){h("[data-error]",n).textContent=`No se pudo desactivar: ${b.message}`}}}},t.addEventListener("submit",async a=>{a.preventDefault(),m.textContent="";let e=u=>t.elements[u].value.trim(),i=u=>e(u)===""?null:Number(e(u)),b={name:e("name"),owner:e("owner")||null,location_type:e("location_type"),latitude:i("latitude"),longitude:i("longitude"),public_zone:e("public_zone")||null,aemet_municipality_code:e("aemet_municipality_code")||null,aemet_station_id:e("aemet_station_id")||null,aemet_warning_area:e("aemet_warning_area")||null,altitude:i("altitude"),installation_date:e("installation_date")||null,firmware_version:e("firmware_version")||null,publish_permission:t.elements.publish_permission.checked,sensors:Object.fromEntries(S.map(([u])=>[u,t.elements[`sensor_${u}`].checked]))};e("coverage_km")!==""&&(b.coverage_km=Number(e("coverage_km")));try{c?(b.active=t.elements.active.checked,await y(`/api/v1/stations/${encodeURIComponent(c.id)}`,{method:"PATCH",body:JSON.stringify(b)})):(b.id=e("id"),b.active=t.elements.active.checked,await y("/api/v1/stations",{method:"POST",body:JSON.stringify(b)})),o(),await v()}catch(u){m.textContent=`No se pudo guardar: ${u.message}`}}),await v()}var M=[["resumen","Resumen"],["estado","Estado"],["config","Configuraci\xF3n"],["mediciones","Mediciones"],["avisos","Avisos"],["estadisticas","Estad\xEDsticas"]];async function W(n,p){let s=new Date,t=new Date(s.getTime()-168*3600*1e3),[m,c]=await Promise.all([y("/api/v1/dashboard?period=24h"),y(`/api/v1/stations/${encodeURIComponent(p)}/measurements/gaps?from=${t.toISOString()}&to=${s.toISOString()}`)]),v=(m.devices||[]).find(d=>d.device.id===p);n.innerHTML=v?`${V(v)}<section class="panel"><div class="section-heading"><div>
        <p class="eyebrow">COBERTURA</p><h2>Integridad de la serie (7 d\xEDas)</h2></div></div>
        <p class="coverage">Esperadas ${c.expected??"\u2014"} seg\xFAn intervalo ${c.intervalSeconds??"\u2014"} s \xB7
          recibidas ${c.received} \xB7 v\xE1lidas ${c.valid} \xB7 inv\xE1lidas ${c.invalid} \xB7
          ausentes ${c.missing} \xB7 cobertura ${c.coveragePct??"\u2014"} %</p>
        ${c.gaps.length?`<div class="table-wrap"><table><thead><tr><th>Desde</th><th>Hasta</th><th>Faltantes</th></tr></thead><tbody>${c.gaps.map(d=>`<tr><td>${r(d.gapFrom)}</td><td>${r(d.gapTo)}</td><td>${r(d.missing)}</td></tr>`).join("")}</tbody></table></div>`:'<p class="empty">No se detectan huecos de secuencia en el periodo.</p>'}
      </section>`:'<section class="panel"><p class="empty">La estaci\xF3n no aparece en el panel (puede estar desactivada o sin acceso).</p></section>'}function X(n,p){let s=p.station,t=p.status,m=p.measurementStats||{},c=S.map(([a,e])=>`<li>${e}: ${s.sensors?.[a]===!1?"desactivado":"activo"}</li>`).join(""),v=[["Identificador",s.id],["Propietario",s.owner],["Emplazamiento",D(s.locationType)],["Zona p\xFAblica",s.publicZone],["Ubicaci\xF3n privada",s.latitude==null?"sin coordenadas":`${s.latitude}, ${s.longitude}`],["Altitud",s.altitude==null?"\u2014":`${s.altitude} m`],["Instalaci\xF3n",f(s.installationDate)],["Cobertura",`${$(s.coverageKm,1)} km`],["Firmware",s.firmwareVersion],["Permiso de publicaci\xF3n",s.publishPermission?"concedido":"no concedido"],["Alta en el sistema",f(s.createdAt)],["Connectividad",t.connectivity],["\xDAltimo contacto",f(t.lastContact)],["\xDAltimo dato v\xE1lido",f(t.lastValidData)],["Bater\xEDa",t.batteryMv==null?"sin dato":`${$(t.batteryMv,0)} mV (${A(t.batteryLevel)})`],["Configuraci\xF3n aplicada",`v${t.configVersion}`],["Muestras pendientes",t.pendingSamples],["Mediciones",`${m.valid??0} v\xE1lidas de ${m.total??0} \xB7 \xFAltima ${f(m.lastObserved)}`],["Reglas de aviso",p.alertRuleCount],["Versiones de configuraci\xF3n",p.configVersionCount]],d=new Set(["Configuraci\xF3n aplicada","Muestras pendientes","Reglas de aviso","Versiones de configuraci\xF3n"]),o=w()?v:v.filter(([a])=>!d.has(a));n.innerHTML=`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">ESTADO OPERATIVO</p><h2>Ficha t\xE9cnica y de estado</h2></div>
      ${w()?'<a class="button-link" href="#/estaciones">Editar desde el listado</a>':""}</div>
    <dl class="detail-grid">${o.map(([a,e])=>`<dt>${a}</dt><dd>${r(e??"\u2014")}</dd>`).join("")}</dl>
    <h3>Sensores</h3><ul class="plain-list">${c}</ul>
  </section>`}async function $e(n,p,s="resumen"){let t=await y(`/api/v1/stations/${encodeURIComponent(p)}`),m=t.station,c=t.status||{},v=O()?M:w()?M.filter(([e])=>e!=="estadisticas"):M.filter(([e])=>["resumen","estado","mediciones","avisos"].includes(e)),d=v.some(([e])=>e===s)?s:"resumen",o=e=>`#/estaciones/${encodeURIComponent(m.id)}/${e}`;if(s==="remoto"&&w()){await L(n,m.id,m);return}n.innerHTML=`
    <div class="page-heading">
      <div>
        <p class="eyebrow"><a href="#/estaciones">Estaciones</a> \xB7 ${r(m.id)}</p>
        <h1>${r(m.name)}</h1>
        <p class="updated">${r([m.owner,m.publicZone].filter(Boolean).join(" \xB7 ")||"Sin propietario registrado")}</p>
      </div>
      <div class="station-tags">
        ${m.active?k(c.connectivity):'<span class="badge badge-muted">Desactivada</span>'}
        ${w()?`<span class="badge badge-muted">Config v${c.configVersion??0}</span>`:""}
        <span class="badge badge-muted">${A(c.batteryLevel)}</span>
        ${w()?`<a class="button-link" href="#/estaciones/${encodeURIComponent(m.id)}/remoto">Control remoto</a>`:""}
      </div>
    </div>
    <nav class="tabs">${v.map(([e,i])=>`<a href="${o(e)}" class="${e===d?"active":""}">${i}</a>`).join("")}</nav>
    <div data-tab-content></div>`;let a=h("[data-tab-content]",n);d==="resumen"?await W(a,m.id):d==="estado"?X(a,t):d==="config"?await I(a,m.id):d==="mediciones"?(a.innerHTML='<section class="panel"></section>',P(h("section",a),{fixedStation:m.id})):d==="estadisticas"?await F(a,m.id,m):await U(a,m.id)}export{$e as renderStationDetail,ge as renderStations};
