import{B as R,a as p,b as n,c as f,e as y,f as S,j as v,l as O,m as I,s as D,t as N}from"./chunk-VIDVWNWC.js";var V={sube:"sube",baja:"baja",estable:"estable",insuficiente:"sin datos suficientes"},H={sube:"#a13333",baja:"#246b91",estable:"#49745a",insuficiente:"#8a938c"},L=t=>`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`,Q=t=>`"${String(t??"").replace(/"/g,'""')}"`;function W(t,s,e){let o=new Date;if(t==="custom"){let m=s?new Date(`${s}T00:00:00`):new Date(o.getTime()-6048e5),u=e?new Date(`${e}T00:00:00`):new Date;return u.setDate(u.getDate()+1),{from:m,to:u}}let d={"24h":24,"7d":168,"30d":720}[t]||168;return{from:new Date(o.getTime()-d*3600*1e3),to:o}}function _(t,s){return t!=="pressure_pa"?{...s,displayUnit:s.unit,digits:s.digits??1}:{...s,unit:"Pa",displayUnit:"mbar",digits:1,min:S(s.min),max:S(s.max),avg:S(s.avg),stddev:S(s.stddev),p10:S(s.p10),p50:S(s.p50),p90:S(s.p90),trend:s.trend?{...s.trend,slopePerHour:s.trend.slopePerHour==null?null:S(s.trend.slopePerHour)}:s.trend}}function G(t,s){let e=_(t,s),o=I[e.label]||"\u{1F4CA}",d=e.trend||{direction:"insuficiente"},m=d.direction==="sube"?"\u2191":d.direction==="baja"?"\u2193":d.direction==="estable"?"\u2192":"\xB7";return`<div class="stat-card">
    <p class="eyebrow"><span class="metric-icon" aria-hidden="true">${o}</span>${n(e.label)} <small>${n(e.displayUnit)}</small></p>
    <div class="stat-row">
      <span>M\xEDn</span><strong>${y(e.min,e.digits)}</strong>
      <span>M\xE1x</span><strong>${y(e.max,e.digits)}</strong>
      <span>Media</span><strong>${y(e.avg,e.digits)}</strong>
    </div>
    <div class="stat-row">
      <span>p10</span><strong>${y(e.p10,e.digits)}</strong>
      <span>p50</span><strong>${y(e.p50,e.digits)}</strong>
      <span>p90</span><strong>${y(e.p90,e.digits)}</strong>
    </div>
    <div class="stat-row">
      <span>Desv.</span><strong>${y(e.stddev,e.digits)}</strong>
      <span>Muestras</span><strong>${e.count}</strong>
      <span></span><strong></strong>
    </div>
    <p class="trend trend-${n(d.direction)}" style="--trend-color:${H[d.direction]||H.insuficiente}">
      ${m} Tendencia ${n(V[d.direction]||d.direction)}${d.slopePerHour!=null?` \xB7 ${y(d.slopePerHour,3)} ${n(e.displayUnit)}/h`:""}
    </p>
  </div>`}function Y(t,s){let e=_(t,s),o=s.dixonQ;if(!o)return"";let d=t==="pressure_pa",m=o.suspectedValue==null?"\u2014":d?`${y(S(o.suspectedValue),1)} mbar`:`${y(o.suspectedValue,e.digits)} ${e.displayUnit}`,u=o.status==="possible_outlier"?"Extremo a revisar":o.status==="no_outlier"?"Sin at\xEDpico detectado":o.status==="no_variation"?"Serie constante":"Muestras insuficientes",a=o.status==="possible_outlier"?"badge badge-warn":"badge badge-muted";return`<article class="dixon-card">
    <div class="dixon-card-head"><strong>${n(e.label)}</strong><span class="${a}">${u}</span></div>
    <div class="dixon-result"><span>Q obs.</span><strong>${y(o.q,3)}</strong><span>Q cr\xEDtica</span><strong>${y(o.criticalQ,3)}</strong></div>
    <p>${o.status==="possible_outlier"?`Posible valor extremo (${o.side}): ${m} \xB7 ${f(o.suspectedAt)}.`:`Muestras evaluadas: ${o.n} de hasta ${o.sampleLimit}.`}</p>
  </article>`}function X(t){if(t.error)return`<section class="panel stats-station"><div class="section-heading"><div><p class="eyebrow">ESTACI\xD3N</p><h2>${n(t.name)}</h2></div></div><p class="error">No se pudo calcular: ${n(t.error)}</p></section>`;let s=t.data,e=s.coverage,o=Object.entries(s.metrics),d=o.map(([a,c])=>G(a,c)).join(""),m=o.map(([a,c])=>Y(a,c)).join(""),u=(s.series||[]).filter(a=>a.temperatureAvg!=null).map(a=>({observedAt:a.at,temperatureC:a.temperatureAvg}));return`<section class="panel stats-station">
    <div class="section-heading">
      <div><p class="eyebrow">ESTACI\xD3N \xB7 ${n(s.deviceId)}</p><h2>${n(t.name)}</h2></div>
      <p class="coverage">${f(s.from)} \u2192 ${f(s.to)} \xB7 ${s.samples} medidas aceptadas por controles autom\xE1ticos</p>
    </div>
    <div class="fact-grid">
      <div><span>Recibidos</span><strong>${e.received}</strong></div>
      <div><span>Esperados</span><strong>${e.expected??"\u2014"}</strong></div>
      <div><span>Cobertura de recibidas</span><strong>${e.receivedPct!=null?`${y(e.receivedPct,1)} %`:"\u2014"}</strong></div>
      <div><span>Cobertura de aceptadas</span><strong>${e.validPct!=null?`${y(e.validPct,1)} %`:"\u2014"}</strong></div>
      <div><span>Aceptadas</span><strong>${e.valid} \xB7 ${e.invalid} inv\xE1lidas</strong></div>
      <div><span>Avisos</span><strong>${s.alerts.total}${s.alerts.open?` \xB7 ${s.alerts.open} abiertos`:""}</strong></div>
    </div>
    <div class="stat-grid">${d}</div>
    <section class="dixon-analysis"><div class="dixon-heading"><div><p class="eyebrow">VALORES AT\xCDPICOS \xB7 Q DE DIXON</p><h3>Solo revisa, no borra</h3></div><span class="badge badge-muted">95 %</span></div><div class="dixon-grid">${m}</div></section>
    ${u.length>1?`<div class="stats-chart">${R("Temperatura media",u,"temperatureC","#16a6bf","\xB0C")}</div>`:""}
    <p class="hint">${(s.limits||[]).map(a=>n(a)).join(" ")}</p>
  </section>`}function K(t,s){let e=[["estacion_id","estacion","desde","hasta","metrica","unidad","muestras","min","max","media","desviacion","p10","p50","p90","tendencia","pendiente_por_hora"].join(",")];for(let o of t){if(o.error)continue;let{data:d}=o;for(let[m,u]of Object.entries(d.metrics)){let a=_(m,u),c=a.trend||{direction:"insuficiente",slopePerHour:null};e.push([d.deviceId,o.name,d.from,d.to,a.label,a.displayUnit,a.count,a.min,a.max,a.avg,a.stddev,a.p10,a.p50,a.p90,c.direction,c.slopePerHour].map(Q).join(","))}}return e.join(`\r
`)}async function M(t){t.innerHTML=`
    <div class="section-heading"><div><p class="eyebrow">AN\xC1LISIS ESTAD\xCDSTICO</p><h2>C\xE1lculo sobre datos aceptados por controles autom\xE1ticos</h2></div></div>
    <div class="stats-controls">
      <div class="stats-field stats-field-stations"><span>Estaciones</span><div class="stats-stations" data-stations><small>Cargando\u2026</small></div></div>
      <div class="stats-field"><label>Periodo<select data-period>
        <option value="24h">\xDAltimas 24 h</option>
        <option value="7d" selected>\xDAltimos 7 d\xEDas</option>
        <option value="30d">\xDAltimos 30 d\xEDas</option>
        <option value="custom">Rango libre</option></select></label></div>
      <div class="stats-field hidden" data-from-field><label>Desde<input type="date" data-from></label></div>
      <div class="stats-field hidden" data-to-field><label>Hasta<input type="date" data-to></label></div>
      <div class="stats-actions">
        <button type="button" data-calc>Calcular</button>
        <button type="button" class="quiet" data-csv disabled>Exportar CSV</button>
      </div>
    </div>
    <p class="error" data-error role="alert"></p>
    <p class="coverage" data-summary></p>
    <div data-results class="stats-results"></div>`;let s={stations:[],entries:[],range:null},e=a=>{p("[data-error]",t).textContent=a},o=new Date;p("[data-from]",t).value=L(new Date(o.getTime()-168*3600*1e3)),p("[data-to]",t).value=L(o);try{let{stations:a}=await v("/api/v1/stations");s.stations=a,p("[data-stations]",t).innerHTML=a.length?a.map(c=>`<label class="check"><input type="checkbox" value="${n(c.id)}" ${a.length===1?"checked":""}> ${n(c.name)} <small>${n(c.id)}</small></label>`).join(""):"<small>No hay estaciones accesibles.</small>"}catch(a){e(`No se pudieron cargar las estaciones: ${a.message}`)}let d=()=>{let a=p("[data-period]",t).value==="custom";p("[data-from-field]",t).classList.toggle("hidden",!a),p("[data-to-field]",t).classList.toggle("hidden",!a)};async function m(){e("");let a=[...t.querySelectorAll("[data-stations] input:checked")].map(g=>g.value);if(!a.length){e("Selecciona al menos una estaci\xF3n.");return}let c=W(p("[data-period]",t).value,p("[data-from]",t).value,p("[data-to]",t).value);if(c.from>=c.to){e("El rango de fechas no es v\xE1lido.");return}s.range=c,p("[data-results]",t).innerHTML='<p class="empty">Calculando\u2026</p>',p("[data-summary]",t).textContent="",p("[data-csv]",t).disabled=!0;let r=await Promise.all(a.map(async g=>{let C=s.stations.find(w=>w.id===g);try{let w=await v(`/api/v1/stations/${encodeURIComponent(g)}/statistics?from=${c.from.toISOString()}&to=${c.to.toISOString()}`);return{id:g,name:C?.name||g,data:w}}catch(w){return{id:g,name:C?.name||g,error:w.message}}}));s.entries=r;let h=r.filter(g=>!g.error);p("[data-summary]",t).textContent=`${h.length} de ${r.length} estaci\xF3n(es) calculadas \xB7 ${f(c.from)} \u2192 ${f(c.to)}`,p("[data-results]",t).innerHTML=r.map(X).join(""),p("[data-csv]",t).disabled=h.length===0}function u(){if(!s.entries.some(h=>!h.error))return;let a=new Blob([K(s.entries,s.range)],{type:"text/csv;charset=utf-8"}),c=URL.createObjectURL(a),r=document.createElement("a");r.href=c,r.download=`tecrural-estadisticas-${L(s.range.from)}.csv`,document.body.appendChild(r),r.click(),r.remove(),URL.revokeObjectURL(c)}p("[data-period]",t).addEventListener("change",d),p("[data-calc]",t).addEventListener("click",m),p("[data-csv]",t).addEventListener("click",u),d()}var j={registrado:"Registrado",interes_declarado:"Inter\xE9s declarado",contacto_solicitado:"Contacto solicitado",contactado:"Contactado",archivado:"Archivado"},E=t=>Object.entries(t).map(([s,e])=>`<option value="${s}">${e}</option>`).join("");async function U(t){t.innerHTML=`<h2>Bandeja de interesados</h2>
    <p>Un registro no solicita una llamada. La actividad de cuenta y el seguimiento comercial son independientes.</p>
    <form data-filters class="rule-form">
      <label>Municipio<input name="municipality" maxlength="160"></label>
      <label>Actividad<select name="activity"><option value="">Todas</option>${E({agricultura:"Agricultura",ganaderia:"Ganader\xEDa",mixta:"Mixta",otra:"Otra"})}</select></label>
      <label>Inter\xE9s<select name="interest"><option value="">Todos</option>${E({heladas:"Heladas",calor:"Calor",tormentas:"Tormentas",viento:"Viento",humedad:"Humedad",general:"General",futura_instalacion:"Instalaci\xF3n"})}</select></label>
      <label>Estado comercial<select name="status"><option value="">Todos</option>${E(j)}</select></label>
      <label>Verificaci\xF3n<select name="verified"><option value="">Todas</option><option value="yes">Correo verificado</option><option value="no">Sin verificar</option></select></label>
      <label>Permiso comercial<select name="permission"><option value="">Todos</option><option value="yes">Autorizado</option><option value="no">Sin permiso</option></select></label>
      <label>Instalaci\xF3n<select name="installation"><option value="">Todos</option><option value="yes">Con inter\xE9s</option></select></label>
      <button>Aplicar filtros</button>
    </form>
    <div class="row-actions"><label>Canal de exportaci\xF3n<select data-channel><option value="email">Correo</option><option value="whatsapp">WhatsApp</option></select></label>
    <button type="button" data-export>Exportar alcance filtrado autorizado</button><button type="button" data-retention>Aplicar retenci\xF3n</button></div>
    <p role="status" data-count></p><p role="alert" class="error" data-inbox-error></p><div data-results></div>`;let s=t.querySelector("[data-filters]"),e=new URLSearchParams,o=u=>{t.querySelector("[data-inbox-error]").textContent=u};async function d(){let{prospects:u}=await v(`/api/v1/admin/prospects?${e}`);t.querySelector("[data-count]").textContent=`${u.length} contactos en el alcance seleccionado`,t.querySelector("[data-results]").innerHTML=u.map(a=>`<details class="panel">
      <summary>${n(a.name)} \xB7 ${n(a.municipality||"Sin municipio")} \xB7 ${n(j[a.status])}</summary>
      <p>${a.verified?"Correo verificado":"Sin verificar"} \xB7 Cuenta: ${a.accountActive==null?"sin cuenta":a.accountActive?"activa":"inactiva"}</p>
      <p>Contacto: ${n(a.email||"")} ${n(a.whatsapp||"")}. Permiso comercial: ${n(Object.keys(a.commercial).filter(c=>a.commercial[c]).join(", ")||"ninguno")}</p>
      <p>Origen: ${n(JSON.stringify(a.origin||{}))} \xB7 Registro: ${f(a.createdAt)}</p>
      <form data-edit="${a.kind}/${a.id}" class="rule-form">
        <label>Estado comercial<select name="status">${Object.entries(j).map(([c,r])=>`<option value="${c}" ${a.status===c?"selected":""}>${r}</option>`).join("")}</select></label>
        <label>Notas<textarea name="notes" maxlength="2000">${n(a.notes||"")}</textarea></label>
        <label>Siguiente acci\xF3n<input name="next_action" maxlength="300" value="${n(a.nextAction||"")}"></label>
        <label>Fecha de siguiente acci\xF3n<input name="next_action_at" type="datetime-local" value="${m(a.nextActionAt)}"></label>
        <label>Retenci\xF3n comercial hasta${a.kind==="subscriber"?" (archiva seguimiento y revoca publicidad)":" (suprime solicitud)"}<input name="retain_until" type="datetime-local" value="${m(a.retainUntil)}"></label>
        <label class="check"><input name="installation_interest" type="checkbox" ${a.installationInterest?"checked":""}>Inter\xE9s en instalaci\xF3n</label>
        <button>Guardar seguimiento</button>
        <button type="button" data-unsubscribe="${a.kind}/${a.id}">Baja comercial de todos los canales</button>
        <button type="button" data-erase="${a.kind}/${a.id}">Suprimir contacto${a.kind==="subscriber"?" y cuenta":""}</button>
      </form></details>`).join("")||"<p>No hay contactos con estos filtros.</p>"}function m(u){if(!u)return"";let a=new Date(u);return new Date(a.getTime()-a.getTimezoneOffset()*6e4).toISOString().slice(0,16)}t.addEventListener("submit",async u=>{u.preventDefault(),u.stopPropagation();let a=u.target;if(a.dataset.busy)return;a.dataset.busy="yes";let c=a.querySelector("button");c.disabled=!0,o("");try{let r=new FormData(a);if(a===s)e=new URLSearchParams([...r].filter(([,h])=>h));else{let h=Object.fromEntries(r);h.installation_interest=r.has("installation_interest");for(let g of["next_action_at","retain_until"])h[g]=h[g]?new Date(h[g]).toISOString():null;await v(`/api/v1/admin/prospects/${a.dataset.edit}`,{method:"PATCH",body:JSON.stringify(h)})}await d()}catch(r){o(`No se pudo guardar o cargar la bandeja: ${r.message}`)}finally{delete a.dataset.busy,c.disabled=!1}}),t.addEventListener("click",async u=>{let a=u.target.closest('button[type="button"]');if(a&&(u.stopPropagation(),!a.disabled)){a.disabled=!0,o("");try{if(a.hasAttribute("data-export")){let c=new URLSearchParams(e);c.set("channel",t.querySelector("[data-channel]").value);let r=await fetch(`/api/v1/admin/prospects/export?${c}`,{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw new Error("No se pudo exportar");let h=URL.createObjectURL(await r.blob()),g=document.createElement("a");g.href=h,g.download="contactos-autorizados.csv",g.click(),setTimeout(()=>URL.revokeObjectURL(h),1e3)}else if(a.dataset.unsubscribe)await v(`/api/v1/admin/prospects/${a.dataset.unsubscribe}/unsubscribe`,{method:"POST"}),await d();else if(a.dataset.erase){if(!confirm("\xBFSuprimir definitivamente este contacto y, si existe, su cuenta?"))return;await v(`/api/v1/admin/prospects/${a.dataset.erase}`,{method:"DELETE"}),await d()}else if(a.hasAttribute("data-retention")){let c=await v("/api/v1/admin/maintenance/retention",{method:"POST"});await d(),t.querySelector("[data-count]").textContent+=` \xB7 ${c.leadsDeleted} solicitudes suprimidas por retenci\xF3n`}}catch(c){o(`No se pudo completar la acci\xF3n: ${c.message}`)}finally{a.disabled=!1}}}),await d()}var Z={home_visit:"Visita a la portada (opcional)",locked_tool_open:"Apertura de herramienta bloqueada (opcional)",access_requested:"Solicitud de acceso",contact_verified:"Contacto verificado",first_expanded_query:"Primera consulta ampliada",agricultural_profile_completed:"Perfil agr\xEDcola completado",commercial_authorized:"Primera autorizaci\xF3n comercial",installation_interest:"Primer inter\xE9s en instalaci\xF3n"},A=t=>`${t.numerator} / ${t.denominator} \xB7 ${t.percent==null?"sin denominador":`${t.percent}%`}`;async function k(t){let s=new Date().toISOString().slice(0,10),e=new Date(Date.now()-30*864e5).toISOString().slice(0,10);t.innerHTML=`<h2>Captaci\xF3n y activaci\xF3n</h2><form class="rule-form" data-period>
    <label>Desde<input name="from" type="date" required value="${e}"></label>
    <label>Hasta<input name="to" type="date" required value="${s}"></label><button>Consultar m\xE9tricas</button></form>
    <p class="error" role="alert" data-error></p><div data-report></div>`;async function o(){let d=t.querySelector("form"),m=d.querySelector("button");if(!m.disabled){m.disabled=!0,t.querySelector("[data-error]").textContent="";try{let u=await v(`/api/v1/admin/analytics?${new URLSearchParams(new FormData(d))}`),{total:a,rates:c}=u;t.querySelector("[data-report]").innerHTML=`<h3>Eventos del per\xEDodo</h3>
        <p>Medici\xF3n nueva desde el despliegue, sin reconstruir eventos hist\xF3ricos. Solicitudes de enlace son emisiones nuevas, no personas \xFAnicas; solicitudes web se deduplican.</p>
        <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Total</th><th>Unidad / denominador</th></tr></thead><tbody>${Object.entries(Z).map(([r,h])=>`<tr><th scope="row">${h}</th><td>${a.events[r]}</td><td>${["home_visit","locked_tool_open"].includes(r)?"Aperturas consentidas, una por carga; no usuarios \xFAnicos ni tasa de conversi\xF3n":"Primera ocurrencia por sujeto; solicitudes de enlace por emisi\xF3n. Conteo, sin porcentaje secuencial"}</td></tr>`).join("")}</tbody></table></div>
        <h3>Cohorte de cuentas registradas en el per\xEDodo \xB7 estado actual</h3>
        <p>${a.registered} cuentas. Correo o canal verificado: ${A(c.verified)}. Activaci\xF3n: ${A(c.activated)}. Perfil agr\xEDcola completo y verificado: ${A(c.agricultural)}. Autorizaci\xF3n vigente: ${A(c.authorized)}. Instalaci\xF3n: ${A(c.installation)}.</p>
        <p>Denominador: cuentas viewer creadas en el mismo per\xEDodo y canal. Cada porcentaje es independiente, no una etapa condicionada por la anterior. Los registros borrados dejan de formar parte de esta cohorte.</p>
        <p>P\xFAblico relevante: ${a.verifiedAgriculturalAuthorized} perfiles agr\xEDcolas completos y verificados con permiso comercial vigente; ${a.agriculturalInstallation} perfiles agr\xEDcolas completos con inter\xE9s en instalaci\xF3n. La exportaci\xF3n comercial aplica adem\xE1s el canal y alcance de la bandeja.</p>
        <div class="table-wrap"><table><caption>Origen permitido: source \xB7 medium \xB7 campaign</caption><thead><tr><th>Canal</th><th>Visitas consentidas</th><th>Solicitudes</th><th>Cuentas</th><th>Verificadas / cuentas</th><th>Agr\xEDcolas verificadas / cuentas</th><th>Permiso vigente / cuentas</th><th>Instalaci\xF3n / cuentas</th></tr></thead><tbody>${u.channels.map(r=>`<tr><th scope="row">${n(r.bucket.split("|").join(" \xB7 "))}</th><td>${r.events.home_visit}</td><td>${r.events.access_requested}</td><td>${r.registered}</td><td>${A(r.rates.verified)}</td><td>${A(r.rates.agricultural)}</td><td>${A(r.rates.authorized)}</td><td>${A(r.rates.installation)}</td></tr>`).join("")||'<tr><td colspan="8">Sin datos en este per\xEDodo.</td></tr>'}</tbody></table></div>
        ${Object.values(u.definitions).map(r=>`<p class="hint">${n(r)}</p>`).join("")}`,t.querySelector("[data-report]").insertAdjacentHTML("beforeend",`<h3>Interesados agr\xEDcolas por canal</h3><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Agr\xEDcolas verificados con permiso vigente</th><th>Agr\xEDcolas con inter\xE9s en instalaci\xF3n</th></tr></thead><tbody>${u.channels.map(r=>`<tr><th scope="row">${n(r.bucket.split("|").join(" \xB7 "))}</th><td>${r.verifiedAgriculturalAuthorized}</td><td>${r.agriculturalInstallation}</td></tr>`).join("")||'<tr><td colspan="3">Sin datos.</td></tr>'}</tbody></table></div>`)}catch(u){t.querySelector("[data-error]").textContent=`No se pudieron cargar las m\xE9tricas: ${u.message}`}finally{m.disabled=!1}}}t.querySelector("form").addEventListener("submit",d=>{d.preventDefault(),d.stopPropagation(),o()}),await o()}var tt=["admin","operator","viewer"],at=["free","pro","enterprise"],et=["nuevo","contactado","interesado","piloto_activo","cliente","descartado"],st={nuevo:"Nuevo",contactado:"Contactado",interesado:"Interesado",piloto_activo:"Piloto activo",cliente:"Cliente",descartado:"Descartado"},z={agricultura:"Agricultura",ganaderia:"Ganader\xEDa",mixta:"Agricultura y ganader\xEDa",otra:"Otra"},B=["email","whatsapp"],q={email:"Correo",whatsapp:"WhatsApp"};function F(t){let s=B.filter(e=>t?.[e]===!0);return s.length?s.map(e=>`<span class="badge badge-valid">${q[e]}</span>`).join(" "):'<span class="badge badge-invalid">sin publicidad</span>'}function J(t,s,e){return B.map(o=>{let d=e?.[o]===!0;return`<button type="button" class="quiet" data-consent-scope="${t}" data-consent-id="${s}"
      data-consent-channel="${o}" data-consent-action="${d?"revoked":"granted"}">
      ${d?"Quitar":"Dar"} ${q[o]}</button>`}).join(" ")}var it={heladas:"Heladas",calor:"Golpes de calor",tormentas:"Tormentas",viento:"Viento",humedad:"Humedad",general:"Informaci\xF3n general",futura_instalacion:"Futura instalaci\xF3n"};function nt(t){let s=t.profile?[t.profile.activity&&(z[t.profile.activity]||t.profile.activity),t.profile.municipality,t.profile.cropOrLivestock].filter(Boolean).join(" \xB7 "):"";return`<tr>
    <td>${n(t.email)}<br>
      <span class="badge badge-muted">registrado</span>
      ${t.verified?'<span class="badge badge-valid">verificado</span>':'<span class="badge badge-warn">sin verificar</span>'}
      ${t.active?"":'<span class="badge badge-invalid">desactivado</span>'}
      ${s?`<div class="alert-detail">${n(s)}</div>`:""}</td>
    <td><select data-role="${t.id}">${tt.map(e=>`<option value="${e}" ${t.role===e?"selected":""}>${D(e)}</option>`).join("")}</select></td>
    <td><select data-plan="${t.id}">${at.map(e=>`<option value="${e}" ${t.plan===e?"selected":""}>${N(e)}</option>`).join("")}</select></td>
    <td><label class="check"><input type="checkbox" data-active="${t.id}" ${t.active?"checked":""}> activo</label></td>
    <td>${F(t.commercial)}<div class="row-actions">${J("subscriber",t.id,t.commercial)}</div></td>
    <td>${t.stationCount} \xB7 ${t.sessionCount} sesiones</td>
    <td class="row-actions">
      <button type="button" data-access="${t.id}" data-email="${n(t.email)}">Accesos</button>
      <button type="button" class="quiet" data-test="${t.id}">Probar aviso</button>
    </td>
  </tr>`}function ot(t){let s=String(t.address||"").replace(/[^\d]/g,""),e=t.body||t.subject||"",o=t.expiresAt&&new Date(t.expiresAt).getTime()<=Date.now(),d=s&&!o?`https://wa.me/${s}?text=${encodeURIComponent(e)}`:"";return`<tr>
    <td>${f(t.createdAt)}${t.expiresAt?`<div class="alert-detail">${o?"Caducado":`Caduca ${f(t.expiresAt)}`}</div>`:""}</td>
    <td>${n(t.address)}</td>
    <td><details><summary>Ver mensaje</summary><pre>${n(e)}</pre></details></td>
    <td class="row-actions">
      ${d?`<a class="button-link" href="${n(d)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`:""}
      ${o?'<span class="badge badge-invalid">No enviar</span>':`<button type="button" data-outbox-sent="${n(t.id)}">Marcar enviado</button>`}
    </td>
  </tr>`}function dt(t){let s=[t.phone,t.email].filter(Boolean).join(" \xB7 "),e=[z[t.activity]||t.activity,t.cropOrLivestock,it[t.interest]||t.interest].filter(Boolean).join(" \xB7 "),o=t.campaign?.source||t.campaign?.campaign?`<div class="alert-detail">captaci\xF3n: ${n([t.campaign.source,t.campaign.campaign].filter(Boolean).join(" \xB7 "))}</div>`:"",d=t.nextContactAt?`<div class="alert-detail">pr\xF3ximo contacto: ${f(t.nextContactAt)}</div>`:"";return`<tr>
    <td>${n(t.name)}<div class="alert-detail">${n(s||"\u2014")}</div>${o}</td>
    <td>${n(t.zone||"\u2014")}<div class="alert-detail">${n(e||"\u2014")}</div>${d}</td>
    <td>${f(t.createdAt)}</td>
    <td><select data-lead-status="${t.id}">${et.map(m=>`<option value="${m}" ${t.status===m?"selected":""}>${st[m]}</option>`).join("")}</select></td>
    <td>${F(t.commercial)}<div class="row-actions">${J("lead",t.id,t.commercial)}</div></td>
    <td class="row-actions">
      <button type="button" data-next-contact="${t.id}">Pr\xF3ximo contacto</button>
      <button type="button" data-activate="${t.id}" data-email="${n(t.email||"")}">Crear cuenta</button>
    </td>
  </tr>`}function ct(t){let s=t.status==="approved"?'<span class="badge badge-valid">Aprobada</span>':t.status==="rejected"?'<span class="badge badge-invalid">Rechazada</span>':'<span class="badge badge-warn">Pendiente</span>',e=t.status!=="pending"?`<br><small>${n(t.decided_by||"")} ${f(t.decided_at)}${t.decision_notes?` \xB7 ${n(t.decision_notes)}`:""}</small>`:"",o=t.status==="pending"?`<button type="button" data-approve="${n(t.subscriber_id)}/${n(t.id)}">Aprobar</button>
       <button type="button" class="quiet" data-reject="${n(t.subscriber_id)}/${n(t.id)}">Rechazar</button>`:"";return`<tr>
    <td>${n(t.farm_name)}<div class="alert-detail">${n(t.location||"")}</div></td>
    <td>${n(t.subscriber_email)}</td>
    <td>${n(t.contact||"\u2014")}</td>
    <td>${f(t.created_at)}${e}</td>
    <td>${s}</td>
    <td class="row-actions">${o}</td>
  </tr>`}function rt(t){return`<tr>
    <td>${f(t.createdAt)}</td>
    <td>${n(t.actorEmail||"\u2014")}</td>
    <td>${n(t.action)}</td>
    <td>${n(t.targetType||"")} ${n(t.targetId||"")}</td>
    <td>${n(t.ipAddress||"\u2014")}</td>
    <td><details><summary>Ver</summary><pre>${n(JSON.stringify({antes:t.beforeJson,despu\u00E9s:t.afterJson},null,2))}</pre></details></td>
  </tr>`}async function yt(t){if(!O()){t.innerHTML='<section class="panel"><p class="empty">Esta secci\xF3n es solo para administradores.</p></section>';return}t.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">ADMINISTRACI\xD3N</p><h1>Usuarios, accesos y trazabilidad</h1></div></div>
    <nav class="admin-tabs" role="tablist" aria-label="Secciones de administraci\xF3n">
      <button type="button" role="tab" data-tab="usuarios" class="active" aria-selected="true">Usuarios y accesos</button>
      <button type="button" role="tab" data-tab="captacion" aria-selected="false">Captaci\xF3n</button>
      <button type="button" role="tab" data-tab="estadisticas" aria-selected="false">Estad\xEDsticas</button>
      <button type="button" role="tab" data-tab="auditoria" aria-selected="false">Auditor\xEDa</button>
    </nav>

    <section data-panel="usuarios">
      <p class="error" data-error role="alert"></p>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">SUSCRIPTORES</p><h2>Registrados, verificados y publicidad</h2>
          <p class="hint" data-audience-counts></p></div></div>
        <input type="search" data-search="subscribers" placeholder="Buscar por correo, actividad o municipio\u2026" aria-label="Buscar suscriptores">
        <div class="table-wrap"><table>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Plan</th><th>Estado</th><th>Publicidad</th><th>Acceso</th><th></th></tr></thead>
          <tbody data-subscribers data-tbody="subscribers"></tbody>
        </table></div>
      </section>
      <section class="panel hidden" data-access-panel>
        <div class="section-heading"><div><p class="eyebrow">ACCESOS</p><h2 data-access-title>Estaciones autorizadas</h2></div>
          <button type="button" class="quiet" data-access-close>Cerrar</button></div>
        <div class="access-grid">
          <div><h3>Concedidas</h3><ul class="plain-list" data-granted></ul></div>
          <div><h3>Disponibles</h3><ul class="plain-list" data-available></ul></div>
        </div>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">WHATSAPP MANUAL</p><h2>Env\xEDos pendientes de enviar a mano</h2></div></div>
        <p class="hint">Durante el piloto no se env\xEDa WhatsApp autom\xE1ticamente. Abre el enlace, env\xEDa el mensaje desde tu tel\xE9fono y m\xE1rcalo como enviado.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Destino</th><th>Mensaje</th><th></th></tr></thead>
          <tbody data-manual data-tbody="manual"></tbody>
        </table></div>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">PILOTOS EN FINCAS</p><h2>Solicitudes de acceso</h2></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Finca</th><th>Solicitante</th><th>Contacto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
          <tbody data-pilots data-tbody="pilots"></tbody>
        </table></div>
      </section>
    </section>

    <section data-panel="captacion" class="hidden">
      <p class="error" data-error role="alert"></p>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">SOLICITUDES WEB</p><h2>Fincas que piden alertas</h2></div></div>
        <input type="search" data-search="leads" placeholder="Buscar por nombre, zona o contacto\u2026" aria-label="Buscar solicitudes web">
        <div class="table-wrap"><table>
          <thead><tr><th>Contacto</th><th>Finca</th><th>Fecha</th><th>Estado</th><th>Publicidad</th><th></th></tr></thead>
          <tbody data-leads data-tbody="leads"></tbody>
        </table></div>
      </section>
      <section class="panel" data-prospects><p class="empty">Cargando bandeja de interesados\u2026</p></section>
      <section class="panel" data-analytics><p class="empty">Cargando m\xE9tricas\u2026</p></section>
    </section>

    <section data-panel="estadisticas" class="hidden">
      <section class="panel" data-statistics-panel><p class="empty">Cargando an\xE1lisis estad\xEDstico\u2026</p></section>
    </section>

    <section data-panel="auditoria" class="hidden">
      <p class="error" data-error role="alert"></p>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">AUDITOR\xCDA</p><h2>Cambios sensibles</h2></div></div>
        <input type="search" data-search="audit" placeholder="Buscar por usuario, acci\xF3n o destino\u2026" aria-label="Buscar en auditor\xEDa">
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acci\xF3n</th><th>Destino</th><th>IP</th><th>Detalle</th></tr></thead>
          <tbody data-audit data-tbody="audit"></tbody>
        </table></div>
      </section>
    </section>`;let s=(b,i)=>{let l=p(`section[data-panel="${b}"] > [data-error]`,t);l&&(l.textContent=i)};async function e(){let{subscribers:b,counts:i}=await v("/api/v1/admin/subscribers");p("[data-subscribers]",t).innerHTML=b.map(nt).join(""),i&&(p("[data-audience-counts]",t).textContent=`Registrados: ${i.registered} \xB7 Verificados: ${i.verified} \xB7 Autorizados para publicidad: ${i.advertising}`)}async function o(){let{outbox:b}=await v("/api/v1/admin/outbox?status=manual");p("[data-manual]",t).innerHTML=b.map(ot).join("")||'<tr><td colspan="4">No hay env\xEDos manuales pendientes.</td></tr>'}async function d(){let{requests:b}=await v("/api/v1/admin/pilot-requests");p("[data-pilots]",t).innerHTML=b.map(ct).join("")||'<tr><td colspan="6">Sin solicitudes de piloto.</td></tr>'}async function m(){let{leads:b}=await v("/api/v1/admin/leads");p("[data-leads]",t).innerHTML=b.map(dt).join("")||'<tr><td colspan="6">Sin solicitudes web.</td></tr>'}async function u(){let b=await v("/api/v1/admin/audit?limit=100");p("[data-audit]",t).innerHTML=b.entries.map(rt).join("")||'<tr><td colspan="6">Sin registros de auditor\xEDa.</td></tr>'}let a=(b,i)=>Promise.all(i.map(l=>l().catch($=>s(b,$.message)))),c={async usuarios(){s("usuarios",""),await a("usuarios",[e,o,d])},async captacion(){s("captacion",""),await a("captacion",[m]),await U(p("[data-prospects]",t)),await k(p("[data-analytics]",t))},async estadisticas(){await M(p("[data-statistics-panel]",t))},async auditoria(){s("auditoria",""),await a("auditoria",[u])}},r=new Set,h=new Set,g=null;async function C(b){if(g!==b){g=b;for(let i of t.querySelectorAll("[data-panel]"))i.classList.toggle("hidden",i.dataset.panel!==b);t.querySelectorAll("[data-tab]").forEach(i=>{let l=i.dataset.tab===b;i.classList.toggle("active",l),i.setAttribute("aria-selected",l?"true":"false")});try{(!r.has(b)||h.has(b))&&(r.add(b),h.delete(b),await c[b]())}catch(i){s(b,`No se pudo cargar la secci\xF3n: ${i.message}`)}}}t.addEventListener("input",b=>{let i=b.target.closest("input[data-search]");if(!i)return;let l=p(`[data-tbody="${i.dataset.search}"]`,t);if(!l)return;let $=i.value.trim().toLowerCase();for(let x of l.rows)x.classList.toggle("hidden",!!$&&!x.textContent.toLowerCase().includes($))});async function w(b){p("[data-access-panel]",t).classList.remove("hidden"),p("[data-access-title]",t).textContent=`Estaciones autorizadas \xB7 #${b}`;let l=await v(`/api/v1/admin/subscribers/${b}/access`);p("[data-granted]",t).innerHTML=l.granted.map($=>`<li>${n($.name)} <small>${n($.id)}</small>
        <button type="button" class="quiet" data-revoke="${n($.id)}" data-subscriber="${l.subscriber.id}">Quitar</button></li>`).join("")||'<li class="empty">Sin estaciones concedidas.</li>',p("[data-available]",t).innerHTML=l.available.map($=>`<li>${n($.name)} <small>${n($.id)}</small>
        <button type="button" data-grant="${n($.id)}" data-subscriber="${l.subscriber.id}">Conceder</button></li>`).join("")||'<li class="empty">No quedan estaciones disponibles.</li>'}let T=async(b,i)=>{try{await v(`/api/v1/admin/subscribers/${b}`,{method:"PATCH",body:JSON.stringify(i)}),await e()}catch(l){s("usuarios",`No se pudo actualizar el usuario: ${l.message}`),await e()}};t.onchange=async b=>{let i=b.target;if(i.dataset.role)await T(i.dataset.role,{role:i.value});else if(i.dataset.plan)await T(i.dataset.plan,{plan:i.value});else if(i.dataset.active)await T(i.dataset.active,{active:i.checked});else if(i.dataset.leadStatus)try{await v(`/api/v1/admin/leads/${i.dataset.leadStatus}`,{method:"PATCH",body:JSON.stringify({status:i.value})}),await m()}catch(l){s("captacion",`No se pudo actualizar la solicitud: ${l.message}`)}},t.onclick=async b=>{let i=b.target.closest("button");if(i){if(i.dataset.tab){await C(i.dataset.tab);return}if(!i.disabled){i.disabled=!0;try{if(i.dataset.access)await w(i.dataset.access);else if(i.dataset.accessClose!==void 0)p("[data-access-panel]",t).classList.add("hidden");else if(i.dataset.grant)await v(`/api/v1/admin/subscribers/${i.dataset.subscriber}/access`,{method:"POST",body:JSON.stringify({device_id:i.dataset.grant})}),await w(i.dataset.subscriber);else if(i.dataset.revoke)await v(`/api/v1/admin/subscribers/${i.dataset.subscriber}/access/${encodeURIComponent(i.dataset.revoke)}`,{method:"DELETE"}),await w(i.dataset.subscriber);else if(i.dataset.consentScope){let l=i.dataset.consentScope,$=l==="subscriber"?`/api/v1/admin/subscribers/${i.dataset.consentId}/consents`:`/api/v1/admin/leads/${i.dataset.consentId}/consents`;await v($,{method:"POST",body:JSON.stringify({channel:i.dataset.consentChannel,action:i.dataset.consentAction})}),l==="subscriber"?await e():(await m(),h.add("usuarios"))}else if(i.dataset.nextContact){let l=window.prompt("Fecha del pr\xF3ximo contacto (AAAA-MM-DD, vac\xEDo para borrar):","");if(l===null)return;let $=l?new Date(`${l}T09:00:00`).toISOString():null;await v(`/api/v1/admin/leads/${i.dataset.nextContact}`,{method:"PATCH",body:JSON.stringify({next_contact_at:$})}),await m()}else if(i.dataset.activate){let l=window.prompt("Correo del nuevo suscriptor:",i.dataset.email||"")||"";if(!l)return;let $=await v(`/api/v1/admin/leads/${i.dataset.activate}/activate`,{method:"POST",body:JSON.stringify({email:l})});window.alert(`Suscriptor creado: ${$.subscriber.email}
Contrase\xF1a temporal (se muestra una sola vez): ${$.temporaryPassword}`),await m(),h.add("usuarios")}else if(i.dataset.test){let l=await v(`/api/v1/admin/subscribers/${i.dataset.test}/test-message`,{method:"POST"});window.alert(l.ok?`Prueba enviada por ${l.channel} a ${l.address}.`:`No se pudo enviar la prueba: ${l.error}`)}else if(i.dataset.outboxSent)await v(`/api/v1/admin/outbox/${i.dataset.outboxSent}`,{method:"PATCH",body:JSON.stringify({status:"sent"})}),await o();else if(i.dataset.approve||i.dataset.reject){let[l,$]=(i.dataset.approve||i.dataset.reject).split("/"),x=i.dataset.approve?"approved":"rejected",P=window.prompt("Notas de la decisi\xF3n (opcional):","")||void 0;await v(`/api/v1/admin/pilot-requests/${l}/${encodeURIComponent($)}`,{method:"PATCH",body:JSON.stringify({status:x,...P?{decision_notes:P}:{}})}),await d()}}catch(l){s(g,`No se pudo completar la acci\xF3n: ${l.message}`)}finally{i.disabled=!1}}}},await C("usuarios")}export{yt as renderAdmin};
