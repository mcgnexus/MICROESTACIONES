import{G as H,b as O,c as u,d as n,e as f,i as y,j as S,n as m,p as I,q as D,x as N,y as R}from"./chunk-IDTT5QG6.js";var W={sube:"sube",baja:"baja",estable:"estable",insuficiente:"sin datos suficientes"},M={sube:"#a13333",baja:"#246b91",estable:"#49745a",insuficiente:"#8a938c"},_=a=>`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,"0")}-${String(a.getDate()).padStart(2,"0")}`,Q=a=>`"${String(a??"").replace(/"/g,'""')}"`;function G(a,s,e){let o=new Date;if(a==="custom"){let v=s?new Date(`${s}T00:00:00`):new Date(o.getTime()-6048e5),l=e?new Date(`${e}T00:00:00`):new Date;return l.setDate(l.getDate()+1),{from:v,to:l}}let c={"24h":24,"7d":168,"30d":720}[a]||168;return{from:new Date(o.getTime()-c*3600*1e3),to:o}}function j(a,s){return a!=="pressure_pa"?{...s,displayUnit:s.unit,digits:s.digits??1}:{...s,unit:"Pa",displayUnit:"mbar",digits:1,min:S(s.min),max:S(s.max),avg:S(s.avg),stddev:S(s.stddev),p10:S(s.p10),p50:S(s.p50),p90:S(s.p90),trend:s.trend?{...s.trend,slopePerHour:s.trend.slopePerHour==null?null:S(s.trend.slopePerHour)}:s.trend}}function Y(a,s){let e=j(a,s),o=D[e.label]||"chart",c=e.trend||{direction:"insuficiente"},v=c.direction==="sube"?"\u2191":c.direction==="baja"?"\u2193":c.direction==="estable"?"\u2192":"\xB7";return`<div class="stat-card">
    <p class="eyebrow"><span class="metric-icon">${O(o,{size:18})}</span>${n(e.label)} <small>${n(e.displayUnit)}</small></p>
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
    <p class="trend trend-${n(c.direction)}" style="--trend-color:${M[c.direction]||M.insuficiente}">
      ${v} Tendencia ${n(W[c.direction]||c.direction)}${c.slopePerHour!=null?` \xB7 ${y(c.slopePerHour,3)} ${n(e.displayUnit)}/h`:""}
    </p>
  </div>`}function X(a,s){let e=j(a,s),o=s.dixonQ;if(!o)return"";let c=a==="pressure_pa",v=o.suspectedValue==null?"\u2014":c?`${y(S(o.suspectedValue),1)} mbar`:`${y(o.suspectedValue,e.digits)} ${e.displayUnit}`,l=o.status==="possible_outlier"?"Extremo a revisar":o.status==="no_outlier"?"Sin at\xEDpico detectado":o.status==="no_variation"?"Serie constante":"Muestras insuficientes",t=o.status==="possible_outlier"?"badge badge-warn":"badge badge-muted";return`<article class="dixon-card">
    <div class="dixon-card-head"><strong>${n(e.label)}</strong><span class="${t}">${l}</span></div>
    <div class="dixon-result"><span>Q obs.</span><strong>${y(o.q,3)}</strong><span>Q cr\xEDtica</span><strong>${y(o.criticalQ,3)}</strong></div>
    <p>${o.status==="possible_outlier"?`Posible valor extremo (${o.side}): ${v} \xB7 ${f(o.suspectedAt)}.`:`Muestras evaluadas: ${o.n} de hasta ${o.sampleLimit}.`}</p>
  </article>`}function K(a){if(a.error)return`<section class="panel stats-station"><div class="section-heading"><div><p class="eyebrow">ESTACI\xD3N</p><h2>${n(a.name)}</h2></div></div><p class="error">No se pudo calcular: ${n(a.error)}</p></section>`;let s=a.data,e=s.coverage,o=Object.entries(s.metrics),c=o.map(([t,d])=>Y(t,d)).join(""),v=o.map(([t,d])=>X(t,d)).join(""),l=(s.series||[]).filter(t=>t.temperatureAvg!=null).map(t=>({observedAt:t.at,temperatureC:t.temperatureAvg}));return`<section class="panel stats-station">
    <div class="section-heading">
      <div><p class="eyebrow">ESTACI\xD3N \xB7 ${n(s.deviceId)}</p><h2>${n(a.name)}</h2></div>
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
    <div class="stat-grid">${c}</div>
    <section class="dixon-analysis"><div class="dixon-heading"><div><p class="eyebrow">VALORES AT\xCDPICOS \xB7 Q DE DIXON</p><h3>Solo revisa, no borra</h3></div><span class="badge badge-muted">95 %</span></div><div class="dixon-grid">${v}</div></section>
    ${l.length>1?`<div class="stats-chart">${H("Temperatura media",l,"temperatureC","#16a6bf","\xB0C")}</div>`:""}
    <p class="hint">${(s.limits||[]).map(t=>n(t)).join(" ")}</p>
  </section>`}function Z(a,s){let e=[["estacion_id","estacion","desde","hasta","metrica","unidad","muestras","min","max","media","desviacion","p10","p50","p90","tendencia","pendiente_por_hora"].join(",")];for(let o of a){if(o.error)continue;let{data:c}=o;for(let[v,l]of Object.entries(c.metrics)){let t=j(v,l),d=t.trend||{direction:"insuficiente",slopePerHour:null};e.push([c.deviceId,o.name,c.from,c.to,t.label,t.displayUnit,t.count,t.min,t.max,t.avg,t.stddev,t.p10,t.p50,t.p90,d.direction,d.slopePerHour].map(Q).join(","))}}return e.join(`\r
`)}async function U(a){a.innerHTML=`
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
    <div data-results class="stats-results"></div>`;let s={stations:[],entries:[],range:null},e=t=>{u("[data-error]",a).textContent=t},o=new Date;u("[data-from]",a).value=_(new Date(o.getTime()-168*3600*1e3)),u("[data-to]",a).value=_(o);try{let{stations:t}=await m("/api/v1/stations");s.stations=t,u("[data-stations]",a).innerHTML=t.length?t.map(d=>`<label class="check"><input type="checkbox" value="${n(d.id)}" ${t.length===1?"checked":""}> ${n(d.name)} <small>${n(d.id)}</small></label>`).join(""):"<small>No hay estaciones accesibles.</small>"}catch(t){e(`No se pudieron cargar las estaciones: ${t.message}`)}let c=()=>{let t=u("[data-period]",a).value==="custom";u("[data-from-field]",a).classList.toggle("hidden",!t),u("[data-to-field]",a).classList.toggle("hidden",!t)};async function v(){e("");let t=[...a.querySelectorAll("[data-stations] input:checked")].map(g=>g.value);if(!t.length){e("Selecciona al menos una estaci\xF3n.");return}let d=G(u("[data-period]",a).value,u("[data-from]",a).value,u("[data-to]",a).value);if(d.from>=d.to){e("El rango de fechas no es v\xE1lido.");return}s.range=d,u("[data-results]",a).innerHTML='<p class="empty">Calculando\u2026</p>',u("[data-summary]",a).textContent="",u("[data-csv]",a).disabled=!0;let r=await Promise.all(t.map(async g=>{let A=s.stations.find(w=>w.id===g);try{let w=await m(`/api/v1/stations/${encodeURIComponent(g)}/statistics?from=${d.from.toISOString()}&to=${d.to.toISOString()}`);return{id:g,name:A?.name||g,data:w}}catch(w){return{id:g,name:A?.name||g,error:w.message}}}));s.entries=r;let h=r.filter(g=>!g.error);u("[data-summary]",a).textContent=`${h.length} de ${r.length} estaci\xF3n(es) calculadas \xB7 ${f(d.from)} \u2192 ${f(d.to)}`,u("[data-results]",a).innerHTML=r.map(K).join(""),u("[data-csv]",a).disabled=h.length===0}function l(){if(!s.entries.some(h=>!h.error))return;let t=new Blob([Z(s.entries,s.range)],{type:"text/csv;charset=utf-8"}),d=URL.createObjectURL(t),r=document.createElement("a");r.href=d,r.download=`tecrural-estadisticas-${_(s.range.from)}.csv`,document.body.appendChild(r),r.click(),r.remove(),URL.revokeObjectURL(d)}u("[data-period]",a).addEventListener("change",c),u("[data-calc]",a).addEventListener("click",v),u("[data-csv]",a).addEventListener("click",l),c()}var E={registrado:"Registrado",interes_declarado:"Inter\xE9s declarado",contacto_solicitado:"Contacto solicitado",contactado:"Contactado",archivado:"Archivado"},x=a=>Object.entries(a).map(([s,e])=>`<option value="${s}">${e}</option>`).join("");async function k(a){a.innerHTML=`<h2>Bandeja de interesados</h2>
    <p>Un registro no solicita una llamada. La actividad de cuenta y el seguimiento comercial son independientes.</p>
    <form data-filters class="rule-form">
      <label>Municipio<input name="municipality" maxlength="160"></label>
      <label>Actividad<select name="activity"><option value="">Todas</option>${x({agricultura:"Agricultura",ganaderia:"Ganader\xEDa",mixta:"Mixta",otra:"Otra"})}</select></label>
      <label>Inter\xE9s<select name="interest"><option value="">Todos</option>${x({heladas:"Heladas",calor:"Calor",tormentas:"Tormentas",viento:"Viento",humedad:"Humedad",general:"General",futura_instalacion:"Instalaci\xF3n"})}</select></label>
      <label>Estado comercial<select name="status"><option value="">Todos</option>${x(E)}</select></label>
      <label>Verificaci\xF3n<select name="verified"><option value="">Todas</option><option value="yes">Correo verificado</option><option value="no">Sin verificar</option></select></label>
      <label>Permiso comercial<select name="permission"><option value="">Todos</option><option value="yes">Autorizado</option><option value="no">Sin permiso</option></select></label>
      <label>Instalaci\xF3n<select name="installation"><option value="">Todos</option><option value="yes">Con inter\xE9s</option></select></label>
      <label>Modalidad<select name="request_type"><option value="">Todas</option>${x({installation_info:"Consulta de instalaci\xF3n",pilot:"Piloto"})}</select></label>
      <label>Canal preferido<select name="preferred_channel"><option value="">Todos</option>${x({email:"Email",whatsapp:"WhatsApp"})}</select></label>
      <button>Aplicar filtros</button>
    </form>
    <div class="row-actions"><label>Canal de exportaci\xF3n<select data-channel><option value="email">Correo</option><option value="whatsapp">WhatsApp</option></select></label>
    <button type="button" data-export>Exportar alcance filtrado autorizado</button><button type="button" data-retention>Aplicar retenci\xF3n</button></div>
    <p role="status" data-count></p><p role="alert" class="error" data-inbox-error></p><div data-results></div>`;let s=a.querySelector("[data-filters]"),e=new URLSearchParams,o=l=>{a.querySelector("[data-inbox-error]").textContent=l};async function c(){let{prospects:l}=await m(`/api/v1/admin/prospects?${e}`);a.querySelector("[data-count]").textContent=`${l.length} contactos en el alcance seleccionado`,a.querySelector("[data-results]").innerHTML=l.map(t=>`<details class="panel">
      <summary>${n(t.name)} \xB7 ${n(t.municipality||"Sin municipio")} \xB7 ${n(E[t.status])}</summary>
      <p>${t.verified?"Correo verificado":"Sin verificar"} \xB7 Cuenta: ${t.accountActive==null?"sin cuenta":t.accountActive?"activa":"inactiva"}</p>
      <p>Contacto: ${n(t.email||"")} ${n(t.whatsapp||"")}. Permiso comercial: ${n(Object.keys(t.commercial).filter(d=>t.commercial[d]).join(", ")||"ninguno")}</p>
      <p>Canal preferido: ${n(t.preferredChannel==="whatsapp"?"WhatsApp":t.preferredChannel==="email"?"Email":"Legado \xB7 sin declarar")} \xB7 Modalidad: ${n(t.requestType==="installation_info"?"Consulta de instalaci\xF3n":t.requestType==="pilot"?"Piloto":"Legado \xB7 sin declarar")}</p>
      <p>Origen: ${n(JSON.stringify(t.origin||{}))} \xB7 Registro: ${f(t.createdAt)}</p>
      <form data-edit="${t.kind}/${t.id}" class="rule-form">
        <label>Estado comercial<select name="status">${Object.entries(E).map(([d,r])=>`<option value="${d}" ${t.status===d?"selected":""}>${r}</option>`).join("")}</select></label>
        <label>Notas<textarea name="notes" maxlength="2000">${n(t.notes||"")}</textarea></label>
        <label>Siguiente acci\xF3n<input name="next_action" maxlength="300" value="${n(t.nextAction||"")}"></label>
        <label>Fecha de siguiente acci\xF3n<input name="next_action_at" type="datetime-local" value="${v(t.nextActionAt)}"></label>
        <label>Retenci\xF3n comercial hasta${t.kind==="subscriber"?" (archiva seguimiento y revoca publicidad)":" (suprime solicitud)"}<input name="retain_until" type="datetime-local" value="${v(t.retainUntil)}"></label>
        <label class="check"><input name="installation_interest" type="checkbox" ${t.installationInterest?"checked":""}>Inter\xE9s en instalaci\xF3n</label>
        <button>Guardar seguimiento</button>
        <button type="button" data-unsubscribe="${t.kind}/${t.id}">Baja comercial de todos los canales</button>
        <button type="button" data-erase="${t.kind}/${t.id}">Suprimir contacto${t.kind==="subscriber"?" y cuenta":""}</button>
      </form></details>`).join("")||"<p>No hay contactos con estos filtros.</p>"}function v(l){if(!l)return"";let t=new Date(l);return new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,16)}a.addEventListener("submit",async l=>{l.preventDefault(),l.stopPropagation();let t=l.target;if(t.dataset.busy)return;t.dataset.busy="yes";let d=t.querySelector("button");d.disabled=!0,o("");try{let r=new FormData(t);if(t===s)e=new URLSearchParams([...r].filter(([,h])=>h));else{let h=Object.fromEntries(r);h.installation_interest=r.has("installation_interest");for(let g of["next_action_at","retain_until"])h[g]=h[g]?new Date(h[g]).toISOString():null;await m(`/api/v1/admin/prospects/${t.dataset.edit}`,{method:"PATCH",body:JSON.stringify(h)})}await c()}catch(r){o(`No se pudo guardar o cargar la bandeja: ${r.message}`)}finally{delete t.dataset.busy,d.disabled=!1}}),a.addEventListener("click",async l=>{let t=l.target.closest('button[type="button"]');if(t&&(l.stopPropagation(),!t.disabled)){t.disabled=!0,o("");try{if(t.hasAttribute("data-export")){let d=new URLSearchParams(e);d.set("channel",a.querySelector("[data-channel]").value);let r=await fetch(`/api/v1/admin/prospects/export?${d}`,{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw new Error("No se pudo exportar");let h=URL.createObjectURL(await r.blob()),g=document.createElement("a");g.href=h,g.download="contactos-autorizados.csv",g.click(),setTimeout(()=>URL.revokeObjectURL(h),1e3)}else if(t.dataset.unsubscribe)await m(`/api/v1/admin/prospects/${t.dataset.unsubscribe}/unsubscribe`,{method:"POST"}),await c();else if(t.dataset.erase){if(!confirm("\xBFSuprimir definitivamente este contacto y, si existe, su cuenta?"))return;await m(`/api/v1/admin/prospects/${t.dataset.erase}`,{method:"DELETE"}),await c()}else if(t.hasAttribute("data-retention")){let d=await m("/api/v1/admin/maintenance/retention",{method:"POST"});await c(),a.querySelector("[data-count]").textContent+=` \xB7 ${d.leadsDeleted} solicitudes suprimidas por retenci\xF3n`}}catch(d){o(`No se pudo completar la acci\xF3n: ${d.message}`)}finally{t.disabled=!1}}}),await c()}var aa={home_visit:"Visita a la portada (opcional)",locked_tool_open:"Apertura de herramienta bloqueada (opcional)",access_requested:"Solicitud de acceso",contact_verified:"Contacto verificado",first_expanded_query:"Primera consulta ampliada",agricultural_profile_completed:"Perfil agr\xEDcola completado",commercial_authorized:"Primera autorizaci\xF3n comercial",installation_interest:"Primer inter\xE9s en instalaci\xF3n"},C=a=>`${a.numerator} / ${a.denominator} \xB7 ${a.percent==null?"sin denominador":`${a.percent}%`}`;async function q(a){let s=new Date().toISOString().slice(0,10),e=new Date(Date.now()-30*864e5).toISOString().slice(0,10);a.innerHTML=`<h2>Captaci\xF3n y activaci\xF3n</h2><form class="rule-form" data-period>
    <label>Desde<input name="from" type="date" required value="${e}"></label>
    <label>Hasta<input name="to" type="date" required value="${s}"></label><button>Consultar m\xE9tricas</button></form>
    <p class="error" role="alert" data-error></p><div data-report></div>`;async function o(){let c=a.querySelector("form"),v=c.querySelector("button");if(!v.disabled){v.disabled=!0,a.querySelector("[data-error]").textContent="";try{let l=await m(`/api/v1/admin/analytics?${new URLSearchParams(new FormData(c))}`),{total:t,rates:d}=l;a.querySelector("[data-report]").innerHTML=`<h3>Eventos del per\xEDodo</h3>
        <p>Medici\xF3n nueva desde el despliegue, sin reconstruir eventos hist\xF3ricos. Solicitudes de enlace son emisiones nuevas, no personas \xFAnicas; solicitudes web se deduplican.</p>
        <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Total</th><th>Unidad / denominador</th></tr></thead><tbody>${Object.entries(aa).map(([r,h])=>`<tr><th scope="row">${h}</th><td>${t.events[r]}</td><td>${["home_visit","locked_tool_open"].includes(r)?"Aperturas consentidas, una por carga; no usuarios \xFAnicos ni tasa de conversi\xF3n":"Primera ocurrencia por sujeto; solicitudes de enlace por emisi\xF3n. Conteo, sin porcentaje secuencial"}</td></tr>`).join("")}</tbody></table></div>
        <h3>Cohorte de cuentas registradas en el per\xEDodo \xB7 estado actual</h3>
        <p>${t.registered} cuentas. Correo o canal verificado: ${C(d.verified)}. Activaci\xF3n: ${C(d.activated)}. Perfil agr\xEDcola completo y verificado: ${C(d.agricultural)}. Autorizaci\xF3n vigente: ${C(d.authorized)}. Instalaci\xF3n: ${C(d.installation)}.</p>
        <p>Denominador: cuentas viewer creadas en el mismo per\xEDodo y canal. Cada porcentaje es independiente, no una etapa condicionada por la anterior. Los registros borrados dejan de formar parte de esta cohorte.</p>
        <p>P\xFAblico relevante: ${t.verifiedAgriculturalAuthorized} perfiles agr\xEDcolas completos y verificados con permiso comercial vigente; ${t.agriculturalInstallation} perfiles agr\xEDcolas completos con inter\xE9s en instalaci\xF3n. La exportaci\xF3n comercial aplica adem\xE1s el canal y alcance de la bandeja.</p>
        <div class="table-wrap"><table><caption>Origen permitido: source \xB7 medium \xB7 campaign</caption><thead><tr><th>Canal</th><th>Visitas consentidas</th><th>Solicitudes</th><th>Cuentas</th><th>Verificadas / cuentas</th><th>Agr\xEDcolas verificadas / cuentas</th><th>Permiso vigente / cuentas</th><th>Instalaci\xF3n / cuentas</th></tr></thead><tbody>${l.channels.map(r=>`<tr><th scope="row">${n(r.bucket.split("|").join(" \xB7 "))}</th><td>${r.events.home_visit}</td><td>${r.events.access_requested}</td><td>${r.registered}</td><td>${C(r.rates.verified)}</td><td>${C(r.rates.agricultural)}</td><td>${C(r.rates.authorized)}</td><td>${C(r.rates.installation)}</td></tr>`).join("")||'<tr><td colspan="8">Sin datos en este per\xEDodo.</td></tr>'}</tbody></table></div>
        ${Object.values(l.definitions).map(r=>`<p class="hint">${n(r)}</p>`).join("")}`,a.querySelector("[data-report]").insertAdjacentHTML("beforeend",`<h3>Interesados agr\xEDcolas por canal</h3><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Agr\xEDcolas verificados con permiso vigente</th><th>Agr\xEDcolas con inter\xE9s en instalaci\xF3n</th></tr></thead><tbody>${l.channels.map(r=>`<tr><th scope="row">${n(r.bucket.split("|").join(" \xB7 "))}</th><td>${r.verifiedAgriculturalAuthorized}</td><td>${r.agriculturalInstallation}</td></tr>`).join("")||'<tr><td colspan="3">Sin datos.</td></tr>'}</tbody></table></div>`)}catch(l){a.querySelector("[data-error]").textContent=`No se pudieron cargar las m\xE9tricas: ${l.message}`}finally{v.disabled=!1}}}a.querySelector("form").addEventListener("submit",c=>{c.preventDefault(),c.stopPropagation(),o()}),await o()}var ta=["admin","operator","viewer"],ea=["free","pro","enterprise"],sa=["nuevo","contactado","interesado","piloto_activo","cliente","descartado"],ia={nuevo:"Nuevo",contactado:"Contactado",interesado:"Interesado",piloto_activo:"Piloto activo",cliente:"Cliente",descartado:"Descartado"},z={agricultura:"Agricultura",ganaderia:"Ganader\xEDa",mixta:"Agricultura y ganader\xEDa",otra:"Otra"},B=["email","whatsapp"],F={email:"Correo",whatsapp:"WhatsApp"};function J(a){let s=B.filter(e=>a?.[e]===!0);return s.length?s.map(e=>`<span class="badge badge-valid">${F[e]}</span>`).join(" "):'<span class="badge badge-invalid">sin publicidad</span>'}function V(a,s,e){return B.map(o=>{let c=e?.[o]===!0;return`<button type="button" class="quiet" data-consent-scope="${a}" data-consent-id="${s}"
      data-consent-channel="${o}" data-consent-action="${c?"revoked":"granted"}">
      ${c?"Quitar":"Dar"} ${F[o]}</button>`}).join(" ")}var na={heladas:"Heladas",calor:"Golpes de calor",tormentas:"Tormentas",viento:"Viento",humedad:"Humedad",general:"Informaci\xF3n general",futura_instalacion:"Futura instalaci\xF3n"};function oa(a){let s=a.profile?[a.profile.activity&&(z[a.profile.activity]||a.profile.activity),a.profile.municipality,a.profile.cropOrLivestock].filter(Boolean).join(" \xB7 "):"";return`<tr>
    <td>${n(a.email)}<br>
      <span class="badge badge-muted">registrado</span>
      ${a.verified?'<span class="badge badge-valid">verificado</span>':'<span class="badge badge-warn">sin verificar</span>'}
      ${a.active?"":'<span class="badge badge-invalid">desactivado</span>'}
      ${s?`<div class="alert-detail">${n(s)}</div>`:""}</td>
    <td><select data-role="${a.id}">${ta.map(e=>`<option value="${e}" ${a.role===e?"selected":""}>${N(e)}</option>`).join("")}</select></td>
    <td><select data-plan="${a.id}">${ea.map(e=>`<option value="${e}" ${a.plan===e?"selected":""}>${R(e)}</option>`).join("")}</select></td>
    <td><label class="check"><input type="checkbox" data-active="${a.id}" ${a.active?"checked":""}> activo</label></td>
    <td>${J(a.commercial)}<div class="row-actions">${V("subscriber",a.id,a.commercial)}</div></td>
    <td>${a.stationCount} \xB7 ${a.sessionCount} sesiones</td>
    <td class="row-actions">
      <button type="button" data-access="${a.id}" data-email="${n(a.email)}">Accesos</button>
      <button type="button" class="quiet" data-test="${a.id}">Probar aviso</button>
    </td>
  </tr>`}function da(a){let s=String(a.address||"").replace(/[^\d]/g,""),e=a.body||a.subject||"",o=a.expiresAt&&new Date(a.expiresAt).getTime()<=Date.now(),c=s&&!o?`https://wa.me/${s}?text=${encodeURIComponent(e)}`:"";return`<tr>
    <td>${f(a.createdAt)}${a.expiresAt?`<div class="alert-detail">${o?"Caducado":`Caduca ${f(a.expiresAt)}`}</div>`:""}</td>
    <td>${n(a.address)}</td>
    <td><details><summary>Ver mensaje</summary><pre>${n(e)}</pre></details></td>
    <td class="row-actions">
      ${c?`<a class="button-link" href="${n(c)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`:""}
      ${o?'<span class="badge badge-invalid">No enviar</span>':`<button type="button" data-outbox-sent="${n(a.id)}">Marcar enviado</button>`}
    </td>
  </tr>`}function ca(a){let s=[a.phone,a.email].filter(Boolean).join(" \xB7 "),e=[z[a.activity]||a.activity,a.cropOrLivestock,na[a.interest]||a.interest].filter(Boolean).join(" \xB7 "),o=!a.requestType&&!a.preferredChannel,c=a.requestType==="installation_info"?'<span class="badge badge-valid">Consulta de instalaci\xF3n</span>':a.requestType==="pilot"?'<span class="badge badge-muted">Piloto</span>':o?'<span class="badge badge-muted">Legado \xB7 sin modalidad declarada</span>':"",v=a.preferredChannel?`<span class="badge badge-muted">${a.preferredChannel==="whatsapp"?"WhatsApp":"Email"}</span>`:"",l=a.campaign?.source||a.campaign?.campaign?`<div class="alert-detail">captaci\xF3n: ${n([a.campaign.source,a.campaign.campaign].filter(Boolean).join(" \xB7 "))}</div>`:"",t=a.nextContactAt?`<div class="alert-detail">pr\xF3ximo contacto: ${f(a.nextContactAt)}</div>`:"";return`<tr>
    <td>${n(a.name)}<div class="alert-detail">${n(s||"\u2014")}</div>${c}${v}${l}</td>
    <td>${n(a.zone||"\u2014")}<div class="alert-detail">${n(e||"\u2014")}</div>${t}</td>
    <td>${f(a.createdAt)}</td>
    <td><select data-lead-status="${a.id}">${sa.map(d=>`<option value="${d}" ${a.status===d?"selected":""}>${ia[d]}</option>`).join("")}</select></td>
    <td>${J(a.commercial)}<div class="row-actions">${V("lead",a.id,a.commercial)}</div></td>
    <td class="row-actions">
      <button type="button" data-next-contact="${a.id}">Pr\xF3ximo contacto</button>
      <button type="button" data-activate="${a.id}" data-email="${n(a.email||"")}">Crear cuenta</button>
    </td>
  </tr>`}function ra(a){let s=a.status==="approved"?'<span class="badge badge-valid">Aprobada</span>':a.status==="rejected"?'<span class="badge badge-invalid">Rechazada</span>':'<span class="badge badge-warn">Pendiente</span>',e=a.status!=="pending"?`<br><small>${n(a.decided_by||"")} ${f(a.decided_at)}${a.decision_notes?` \xB7 ${n(a.decision_notes)}`:""}</small>`:"",o=a.status==="pending"?`<button type="button" data-approve="${n(a.subscriber_id)}/${n(a.id)}">Aprobar</button>
       <button type="button" class="quiet" data-reject="${n(a.subscriber_id)}/${n(a.id)}">Rechazar</button>`:"";return`<tr>
    <td>${n(a.farm_name)}<div class="alert-detail">${n(a.location||"")}</div></td>
    <td>${n(a.subscriber_email)}</td>
    <td>${n(a.contact||"\u2014")}</td>
    <td>${f(a.created_at)}${e}</td>
    <td>${s}</td>
    <td class="row-actions">${o}</td>
  </tr>`}function la(a){return`<tr>
    <td>${f(a.createdAt)}</td>
    <td>${n(a.actorEmail||"\u2014")}</td>
    <td>${n(a.action)}</td>
    <td>${n(a.targetType||"")} ${n(a.targetId||"")}</td>
    <td>${n(a.ipAddress||"\u2014")}</td>
    <td><details><summary>Ver</summary><pre>${n(JSON.stringify({antes:a.beforeJson,despu\u00E9s:a.afterJson},null,2))}</pre></details></td>
  </tr>`}async function wa(a){if(!I()){a.innerHTML='<section class="panel"><p class="empty">Esta secci\xF3n es solo para administradores.</p></section>';return}a.innerHTML=`
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
    </section>`;let s=(b,i)=>{let p=u(`section[data-panel="${b}"] > [data-error]`,a);p&&(p.textContent=i)};async function e(){let{subscribers:b,counts:i}=await m("/api/v1/admin/subscribers");u("[data-subscribers]",a).innerHTML=b.map(oa).join(""),i&&(u("[data-audience-counts]",a).textContent=`Registrados: ${i.registered} \xB7 Verificados: ${i.verified} \xB7 Autorizados para publicidad: ${i.advertising}`)}async function o(){let{outbox:b}=await m("/api/v1/admin/outbox?status=manual");u("[data-manual]",a).innerHTML=b.map(da).join("")||'<tr><td colspan="4">No hay env\xEDos manuales pendientes.</td></tr>'}async function c(){let{requests:b}=await m("/api/v1/admin/pilot-requests");u("[data-pilots]",a).innerHTML=b.map(ra).join("")||'<tr><td colspan="6">Sin solicitudes de piloto.</td></tr>'}async function v(){let{leads:b}=await m("/api/v1/admin/leads");u("[data-leads]",a).innerHTML=b.map(ca).join("")||'<tr><td colspan="6">Sin solicitudes web.</td></tr>'}async function l(){let b=await m("/api/v1/admin/audit?limit=100");u("[data-audit]",a).innerHTML=b.entries.map(la).join("")||'<tr><td colspan="6">Sin registros de auditor\xEDa.</td></tr>'}let t=(b,i)=>Promise.all(i.map(p=>p().catch($=>s(b,$.message)))),d={async usuarios(){s("usuarios",""),await t("usuarios",[e,o,c])},async captacion(){s("captacion",""),await t("captacion",[v]),await k(u("[data-prospects]",a)),await q(u("[data-analytics]",a))},async estadisticas(){await U(u("[data-statistics-panel]",a))},async auditoria(){s("auditoria",""),await t("auditoria",[l])}},r=new Set,h=new Set,g=null;async function A(b){if(g!==b){g=b;for(let i of a.querySelectorAll("[data-panel]"))i.classList.toggle("hidden",i.dataset.panel!==b);a.querySelectorAll("[data-tab]").forEach(i=>{let p=i.dataset.tab===b;i.classList.toggle("active",p),i.setAttribute("aria-selected",p?"true":"false")});try{(!r.has(b)||h.has(b))&&(r.add(b),h.delete(b),await d[b]())}catch(i){s(b,`No se pudo cargar la secci\xF3n: ${i.message}`)}}}a.addEventListener("input",b=>{let i=b.target.closest("input[data-search]");if(!i)return;let p=u(`[data-tbody="${i.dataset.search}"]`,a);if(!p)return;let $=i.value.trim().toLowerCase();for(let T of p.rows)T.classList.toggle("hidden",!!$&&!T.textContent.toLowerCase().includes($))});async function w(b){u("[data-access-panel]",a).classList.remove("hidden"),u("[data-access-title]",a).textContent=`Estaciones autorizadas \xB7 #${b}`;let p=await m(`/api/v1/admin/subscribers/${b}/access`);u("[data-granted]",a).innerHTML=p.granted.map($=>`<li>${n($.name)} <small>${n($.id)}</small>
        <button type="button" class="quiet" data-revoke="${n($.id)}" data-subscriber="${p.subscriber.id}">Quitar</button></li>`).join("")||'<li class="empty">Sin estaciones concedidas.</li>',u("[data-available]",a).innerHTML=p.available.map($=>`<li>${n($.name)} <small>${n($.id)}</small>
        <button type="button" data-grant="${n($.id)}" data-subscriber="${p.subscriber.id}">Conceder</button></li>`).join("")||'<li class="empty">No quedan estaciones disponibles.</li>'}let L=async(b,i)=>{try{await m(`/api/v1/admin/subscribers/${b}`,{method:"PATCH",body:JSON.stringify(i)}),await e()}catch(p){s("usuarios",`No se pudo actualizar el usuario: ${p.message}`),await e()}};a.onchange=async b=>{let i=b.target;if(i.dataset.role)await L(i.dataset.role,{role:i.value});else if(i.dataset.plan)await L(i.dataset.plan,{plan:i.value});else if(i.dataset.active)await L(i.dataset.active,{active:i.checked});else if(i.dataset.leadStatus)try{await m(`/api/v1/admin/leads/${i.dataset.leadStatus}`,{method:"PATCH",body:JSON.stringify({status:i.value})}),await v()}catch(p){s("captacion",`No se pudo actualizar la solicitud: ${p.message}`)}},a.onclick=async b=>{let i=b.target.closest("button");if(i){if(i.dataset.tab){await A(i.dataset.tab);return}if(!i.disabled){i.disabled=!0;try{if(i.dataset.access)await w(i.dataset.access);else if(i.dataset.accessClose!==void 0)u("[data-access-panel]",a).classList.add("hidden");else if(i.dataset.grant)await m(`/api/v1/admin/subscribers/${i.dataset.subscriber}/access`,{method:"POST",body:JSON.stringify({device_id:i.dataset.grant})}),await w(i.dataset.subscriber);else if(i.dataset.revoke)await m(`/api/v1/admin/subscribers/${i.dataset.subscriber}/access/${encodeURIComponent(i.dataset.revoke)}`,{method:"DELETE"}),await w(i.dataset.subscriber);else if(i.dataset.consentScope){let p=i.dataset.consentScope,$=p==="subscriber"?`/api/v1/admin/subscribers/${i.dataset.consentId}/consents`:`/api/v1/admin/leads/${i.dataset.consentId}/consents`;await m($,{method:"POST",body:JSON.stringify({channel:i.dataset.consentChannel,action:i.dataset.consentAction})}),p==="subscriber"?await e():(await v(),h.add("usuarios"))}else if(i.dataset.nextContact){let p=window.prompt("Fecha del pr\xF3ximo contacto (AAAA-MM-DD, vac\xEDo para borrar):","");if(p===null)return;let $=p?new Date(`${p}T09:00:00`).toISOString():null;await m(`/api/v1/admin/leads/${i.dataset.nextContact}`,{method:"PATCH",body:JSON.stringify({next_contact_at:$})}),await v()}else if(i.dataset.activate){let p=window.prompt("Correo del nuevo suscriptor:",i.dataset.email||"")||"";if(!p)return;let $=await m(`/api/v1/admin/leads/${i.dataset.activate}/activate`,{method:"POST",body:JSON.stringify({email:p})});window.alert(`Suscriptor creado: ${$.subscriber.email}
Contrase\xF1a temporal (se muestra una sola vez): ${$.temporaryPassword}`),await v(),h.add("usuarios")}else if(i.dataset.test){let p=await m(`/api/v1/admin/subscribers/${i.dataset.test}/test-message`,{method:"POST"});window.alert(p.ok?`Prueba enviada por ${p.channel} a ${p.address}.`:`No se pudo enviar la prueba: ${p.error}`)}else if(i.dataset.outboxSent)await m(`/api/v1/admin/outbox/${i.dataset.outboxSent}`,{method:"PATCH",body:JSON.stringify({status:"sent"})}),await o();else if(i.dataset.approve||i.dataset.reject){let[p,$]=(i.dataset.approve||i.dataset.reject).split("/"),T=i.dataset.approve?"approved":"rejected",P=window.prompt("Notas de la decisi\xF3n (opcional):","")||void 0;await m(`/api/v1/admin/pilot-requests/${p}/${encodeURIComponent($)}`,{method:"PATCH",body:JSON.stringify({status:T,...P?{decision_notes:P}:{}})}),await c()}}catch(p){s(g,`No se pudo completar la acci\xF3n: ${p.message}`)}finally{i.disabled=!1}}}},await A("usuarios")}export{wa as renderAdmin};
