import{J as k,b as N,c as p,d as s,e as y,i as S,j as C,n as h,p as D,q as R,r as x,y as H,z as M}from"./chunk-VEUGMMMA.js";var Y={sube:"sube",baja:"baja",estable:"estable",insuficiente:"sin datos suficientes"},U={sube:"#a13333",baja:"#246b91",estable:"#49745a",insuficiente:"#8a938c"},P=t=>`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`,X=t=>`"${String(t??"").replace(/"/g,'""')}"`;function K(t,i,e){let d=new Date;if(t==="custom"){let v=i?new Date(`${i}T00:00:00`):new Date(d.getTime()-6048e5),r=e?new Date(`${e}T00:00:00`):new Date;return r.setDate(r.getDate()+1),{from:v,to:r}}let c={"24h":24,"7d":168,"30d":720}[t]||168;return{from:new Date(d.getTime()-c*3600*1e3),to:d}}function E(t,i){return t!=="pressure_pa"?{...i,displayUnit:i.unit,digits:i.digits??1}:{...i,unit:"Pa",displayUnit:"mbar",digits:1,min:C(i.min),max:C(i.max),avg:C(i.avg),stddev:C(i.stddev),p10:C(i.p10),p50:C(i.p50),p90:C(i.p90),trend:i.trend?{...i.trend,slopePerHour:i.trend.slopePerHour==null?null:C(i.trend.slopePerHour)}:i.trend}}function Z(t,i){let e=E(t,i),d=R[e.label]||"chart",c=e.trend||{direction:"insuficiente"},v=c.direction==="sube"?"\u2191":c.direction==="baja"?"\u2193":c.direction==="estable"?"\u2192":"\xB7";return`<div class="stat-card">
    <p class="eyebrow"><span class="metric-icon">${N(d,{size:18})}</span>${s(e.label)} <small>${s(e.displayUnit)}</small></p>
    <div class="stat-row">
      <span>M\xEDn</span><strong>${S(e.min,e.digits)}</strong>
      <span>M\xE1x</span><strong>${S(e.max,e.digits)}</strong>
      <span>Media</span><strong>${S(e.avg,e.digits)}</strong>
    </div>
    <div class="stat-row">
      <span>p10</span><strong>${S(e.p10,e.digits)}</strong>
      <span>p50</span><strong>${S(e.p50,e.digits)}</strong>
      <span>p90</span><strong>${S(e.p90,e.digits)}</strong>
    </div>
    <div class="stat-row">
      <span>Desv.</span><strong>${S(e.stddev,e.digits)}</strong>
      <span>Muestras</span><strong>${e.count}</strong>
      <span></span><strong></strong>
    </div>
    <p class="trend trend-${s(c.direction)}" style="--trend-color:${U[c.direction]||U.insuficiente}">
      ${v} Tendencia ${s(Y[c.direction]||c.direction)}${c.slopePerHour!=null?` \xB7 ${S(c.slopePerHour,3)} ${s(e.displayUnit)}/h`:""}
    </p>
  </div>`}function tt(t,i){let e=E(t,i),d=i.dixonQ;if(!d)return"";let c=t==="pressure_pa",v=d.suspectedValue==null?"\u2014":c?`${S(C(d.suspectedValue),1)} mbar`:`${S(d.suspectedValue,e.digits)} ${e.displayUnit}`,r=d.status==="possible_outlier"?"Extremo a revisar":d.status==="no_outlier"?"Sin at\xEDpico detectado":d.status==="no_variation"?"Serie constante":"Muestras insuficientes",a=d.status==="possible_outlier"?"badge badge-warn":"badge badge-muted";return`<article class="dixon-card">
    <div class="dixon-card-head"><strong>${s(e.label)}</strong><span class="${a}">${r}</span></div>
    <div class="dixon-result"><span>Q obs.</span><strong>${S(d.q,3)}</strong><span>Q cr\xEDtica</span><strong>${S(d.criticalQ,3)}</strong></div>
    <p>${d.status==="possible_outlier"?`Posible valor extremo (${d.side}): ${v} \xB7 ${y(d.suspectedAt)}.`:`Muestras evaluadas: ${d.n} de hasta ${d.sampleLimit}.`}</p>
  </article>`}function at(t){if(t.error)return`<section class="panel stats-station"><div class="section-heading"><div><p class="eyebrow">ESTACI\xD3N</p><h2>${s(t.name)}</h2></div></div><p class="error">No se pudo calcular: ${s(t.error)}</p></section>`;let i=t.data,e=i.coverage,d=Object.entries(i.metrics),c=d.map(([a,o])=>Z(a,o)).join(""),v=d.map(([a,o])=>tt(a,o)).join(""),r=(i.series||[]).filter(a=>a.temperatureAvg!=null).map(a=>({observedAt:a.at,temperatureC:a.temperatureAvg}));return`<section class="panel stats-station">
    <div class="section-heading">
      <div><p class="eyebrow">ESTACI\xD3N \xB7 ${s(i.deviceId)}</p><h2>${s(t.name)}</h2></div>
      <p class="coverage">${y(i.from)} \u2192 ${y(i.to)} \xB7 ${i.samples} medidas aceptadas por controles autom\xE1ticos</p>
    </div>
    <div class="fact-grid">
      <div><span>Recibidos</span><strong>${e.received}</strong></div>
      <div><span>Esperados</span><strong>${e.expected??"\u2014"}</strong></div>
      <div><span>Cobertura de recibidas</span><strong>${e.receivedPct!=null?`${S(e.receivedPct,1)} %`:"\u2014"}</strong></div>
      <div><span>Cobertura de aceptadas</span><strong>${e.validPct!=null?`${S(e.validPct,1)} %`:"\u2014"}</strong></div>
      <div><span>Aceptadas</span><strong>${e.valid} \xB7 ${e.invalid} inv\xE1lidas</strong></div>
      <div><span>Avisos</span><strong>${i.alerts.total}${i.alerts.open?` \xB7 ${i.alerts.open} abiertos`:""}</strong></div>
    </div>
    <div class="stat-grid">${c}</div>
    <section class="dixon-analysis"><div class="dixon-heading"><div><p class="eyebrow">VALORES AT\xCDPICOS \xB7 Q DE DIXON</p><h3>Solo revisa, no borra</h3></div><span class="badge badge-muted">95 %</span></div><div class="dixon-grid">${v}</div></section>
    ${r.length>1?`<div class="stats-chart">${k("Temperatura media",r,"temperatureC","#16a6bf","\xB0C")}</div>`:""}
    <p class="hint">${(i.limits||[]).map(a=>s(a)).join(" ")}</p>
  </section>`}function et(t,i){let e=[["estacion_id","estacion","desde","hasta","metrica","unidad","muestras","min","max","media","desviacion","p10","p50","p90","tendencia","pendiente_por_hora"].join(",")];for(let d of t){if(d.error)continue;let{data:c}=d;for(let[v,r]of Object.entries(c.metrics)){let a=E(v,r),o=a.trend||{direction:"insuficiente",slopePerHour:null};e.push([c.deviceId,d.name,c.from,c.to,a.label,a.displayUnit,a.count,a.min,a.max,a.avg,a.stddev,a.p10,a.p50,a.p90,o.direction,o.slopePerHour].map(X).join(","))}}return e.join(`\r
`)}async function q(t){t.innerHTML=`
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
    <div data-results class="stats-results"></div>`;let i={stations:[],entries:[],range:null},e=a=>{p("[data-error]",t).textContent=a},d=new Date;p("[data-from]",t).value=P(new Date(d.getTime()-168*3600*1e3)),p("[data-to]",t).value=P(d);try{let{stations:a}=await h("/api/v1/stations");i.stations=a,p("[data-stations]",t).innerHTML=a.length?a.map(o=>`<label class="check"><input type="checkbox" value="${s(o.id)}" ${a.length===1?"checked":""}> ${s(o.name)} <small>${s(o.id)}</small></label>`).join(""):"<small>No hay estaciones accesibles.</small>"}catch(a){e(`No se pudieron cargar las estaciones: ${a.message}`)}let c=()=>{let a=p("[data-period]",t).value==="custom";p("[data-from-field]",t).classList.toggle("hidden",!a),p("[data-to-field]",t).classList.toggle("hidden",!a)};async function v(){e("");let a=[...t.querySelectorAll("[data-stations] input:checked")].map(g=>g.value);if(!a.length){e("Selecciona al menos una estaci\xF3n.");return}let o=K(p("[data-period]",t).value,p("[data-from]",t).value,p("[data-to]",t).value);if(o.from>=o.to){e("El rango de fechas no es v\xE1lido.");return}i.range=o,p("[data-results]",t).innerHTML='<p class="empty">Calculando\u2026</p>',p("[data-summary]",t).textContent="",p("[data-csv]",t).disabled=!0;let b=await Promise.all(a.map(async g=>{let A=i.stations.find(m=>m.id===g);try{let m=await h(`/api/v1/stations/${encodeURIComponent(g)}/statistics?from=${o.from.toISOString()}&to=${o.to.toISOString()}`);return{id:g,name:A?.name||g,data:m}}catch(m){return{id:g,name:A?.name||g,error:m.message}}}));i.entries=b;let $=b.filter(g=>!g.error);p("[data-summary]",t).textContent=`${$.length} de ${b.length} estaci\xF3n(es) calculadas \xB7 ${y(o.from)} \u2192 ${y(o.to)}`,p("[data-results]",t).innerHTML=b.map(at).join(""),p("[data-csv]",t).disabled=$.length===0}function r(){if(!i.entries.some($=>!$.error))return;let a=new Blob([et(i.entries,i.range)],{type:"text/csv;charset=utf-8"}),o=URL.createObjectURL(a),b=document.createElement("a");b.href=o,b.download=`tecrural-estadisticas-${P(i.range.from)}.csv`,document.body.appendChild(b),b.click(),b.remove(),URL.revokeObjectURL(o)}p("[data-period]",t).addEventListener("change",c),p("[data-calc]",t).addEventListener("click",v),p("[data-csv]",t).addEventListener("click",r),c()}var j={registrado:"Registrado",interes_declarado:"Inter\xE9s declarado",contacto_solicitado:"Contacto solicitado",contactado:"Contactado",archivado:"Archivado"},L=t=>Object.entries(t).map(([i,e])=>`<option value="${i}">${e}</option>`).join("");async function z(t){t.innerHTML=`<h2>Bandeja de interesados</h2>
    <p>Un registro no solicita una llamada. La actividad de cuenta y el seguimiento comercial son independientes.</p>
    <form data-filters class="rule-form">
      <label>Municipio<input name="municipality" maxlength="160"></label>
      <label>Actividad<select name="activity"><option value="">Todas</option>${L({agricultura:"Agricultura",ganaderia:"Ganader\xEDa",mixta:"Mixta",otra:"Otra"})}</select></label>
      <label>Inter\xE9s<select name="interest"><option value="">Todos</option>${L({heladas:"Heladas",calor:"Calor",tormentas:"Tormentas",viento:"Viento",humedad:"Humedad",general:"General",futura_instalacion:"Instalaci\xF3n"})}</select></label>
      <label>Estado comercial<select name="status"><option value="">Todos</option>${L(j)}</select></label>
      <label>Solicitado<select name="created_since"><option value="">Cualquier fecha</option><option value="today">Hoy</option><option value="7d">\xDAltimos 7 d\xEDas</option><option value="30d">\xDAltimos 30 d\xEDas</option></select></label>
      <label>Verificaci\xF3n<select name="verified"><option value="">Todas</option><option value="yes">Correo verificado</option><option value="no">Sin verificar</option></select></label>
      <label>Permiso comercial<select name="permission"><option value="">Todos</option><option value="yes">Autorizado</option><option value="no">Sin permiso</option></select></label>
      <label>Instalaci\xF3n<select name="installation"><option value="">Todos</option><option value="yes">Con inter\xE9s</option></select></label>
      <label>Modalidad<select name="request_type"><option value="">Todas</option>${L({installation_info:"Consulta de instalaci\xF3n",pilot:"Piloto"})}</select></label>
      <label>Canal preferido<select name="preferred_channel"><option value="">Todos</option>${L({email:"Email",whatsapp:"WhatsApp"})}</select></label>
      <button>Aplicar filtros</button>
    </form>
    <div class="row-actions"><label>Canal de exportaci\xF3n<select data-channel><option value="email">Correo</option><option value="whatsapp">WhatsApp</option></select></label>
    <button type="button" data-export>Exportar alcance filtrado autorizado</button><button type="button" data-retention>Aplicar retenci\xF3n</button></div>
    <p role="status" data-count></p><p role="alert" class="error" data-inbox-error></p><div data-results></div>`;let i=t.querySelector("[data-filters]"),e=new URLSearchParams,d=r=>{t.querySelector("[data-inbox-error]").textContent=r};async function c(){let{prospects:r}=await h(`/api/v1/admin/prospects?${e}`);t.querySelector("[data-count]").textContent=`${r.length} contactos en el alcance seleccionado`,t.querySelector("[data-results]").innerHTML=r.map(a=>`<details class="panel">
      <summary>${s(a.name)} \xB7 ${s(a.municipality||"Sin municipio")} \xB7 ${s(j[a.status])}</summary>
      <p>${a.verified?"Correo verificado":"Sin verificar"} \xB7 Cuenta: ${a.accountActive==null?"sin cuenta":a.accountActive?"activa":"inactiva"}</p>
      <p>Contacto: ${s(a.email||"")} ${s(a.whatsapp||"")}. Permiso comercial: ${s(Object.keys(a.commercial).filter(o=>a.commercial[o]).join(", ")||"ninguno")}</p>
      <p>Canal preferido: ${s(a.preferredChannel==="whatsapp"?"WhatsApp":a.preferredChannel==="email"?"Email":"Legado \xB7 sin declarar")} \xB7 Modalidad: ${s(a.requestType==="installation_info"?"Consulta de instalaci\xF3n":a.requestType==="pilot"?"Piloto":"Legado \xB7 sin declarar")}</p>
      <p>Verificaci\xF3n: ${a.kind==="subscriber"?`${a.whatsappReady?"WhatsApp listo":"WhatsApp pendiente"} \xB7 ${a.emailReady?"email listo":"email pendiente"}`:"Sin verificaci\xF3n (captaci\xF3n: se verifica al crear cuenta)"}</p>
      <p>Inter\xE9s agron\xF3mico: ${s(a.interest||"no declarado")} \xB7 Actividad: ${s(a.activity||"no declarada")} \xB7 Municipio: ${s(a.municipality||"no declarado")}</p>
      <p>Permisos \xB7 Atender solicitud: ${Object.keys(a.service||{}).filter(o=>a.service[o]).join(", ")||"sin permiso expl\xEDcito"} \xB7 Avisos p\xFAblicos: ${a.alertsSubscription?"suscrito":"no"} \xB7 Publicidad: ${s(Object.keys(a.commercial).filter(o=>a.commercial[o]).join(", ")||"ninguno")}</p>
      <p>Estado comercial: ${s(j[a.status])} \xB7 Siguiente acci\xF3n: ${s(a.nextAction||"sin definir")}${a.nextActionAt?` (${y(a.nextActionAt)})`:""}</p>
      <p>Origen: ${s(JSON.stringify(a.origin||{}))} \xB7 Registro: ${y(a.createdAt)}</p>
      <form data-edit="${a.kind}/${a.id}" class="rule-form">
        <label>Estado comercial<select name="status">${Object.entries(j).map(([o,b])=>`<option value="${o}" ${a.status===o?"selected":""}>${b}</option>`).join("")}</select></label>
        <label>Notas<textarea name="notes" maxlength="2000">${s(a.notes||"")}</textarea></label>
        <label>Siguiente acci\xF3n<input name="next_action" maxlength="300" value="${s(a.nextAction||"")}"></label>
        <label>Fecha de siguiente acci\xF3n<input name="next_action_at" type="datetime-local" value="${v(a.nextActionAt)}"></label>
        <label>Retenci\xF3n comercial hasta${a.kind==="subscriber"?" (archiva seguimiento y revoca publicidad)":" (suprime solicitud)"}<input name="retain_until" type="datetime-local" value="${v(a.retainUntil)}"></label>
        <label class="check"><input name="installation_interest" type="checkbox" ${a.installationInterest?"checked":""}>Inter\xE9s en instalaci\xF3n</label>
        <button>Guardar seguimiento</button>
        <button type="button" data-unsubscribe="${a.kind}/${a.id}">Baja comercial de todos los canales</button>
        <button type="button" data-erase="${a.kind}/${a.id}">Suprimir contacto${a.kind==="subscriber"?" y cuenta":""}</button>
      </form></details>`).join("")||"<p>No hay contactos con estos filtros.</p>"}function v(r){if(!r)return"";let a=new Date(r);return new Date(a.getTime()-a.getTimezoneOffset()*6e4).toISOString().slice(0,16)}t.addEventListener("submit",async r=>{r.preventDefault(),r.stopPropagation();let a=r.target;if(a.dataset.busy)return;a.dataset.busy="yes";let o=a.querySelector("button");o.disabled=!0,d("");try{let b=new FormData(a);if(a===i)e=new URLSearchParams([...b].filter(([,$])=>$));else{let $=Object.fromEntries(b);$.installation_interest=b.has("installation_interest");for(let g of["next_action_at","retain_until"])$[g]=$[g]?new Date($[g]).toISOString():null;await h(`/api/v1/admin/prospects/${a.dataset.edit}`,{method:"PATCH",body:JSON.stringify($)})}await c()}catch(b){d(`No se pudo guardar o cargar la bandeja: ${b.message}`)}finally{delete a.dataset.busy,o.disabled=!1}}),t.addEventListener("click",async r=>{let a=r.target.closest('button[type="button"]');if(a&&(r.stopPropagation(),!a.disabled)){a.disabled=!0,d("");try{if(a.hasAttribute("data-export")){let o=new URLSearchParams(e);o.set("channel",t.querySelector("[data-channel]").value);let b=await fetch(`/api/v1/admin/prospects/export?${o}`,{credentials:"same-origin",cache:"no-store"});if(!b.ok)throw new Error("No se pudo exportar");let $=URL.createObjectURL(await b.blob()),g=document.createElement("a");g.href=$,g.download="contactos-autorizados.csv",g.click(),setTimeout(()=>URL.revokeObjectURL($),1e3)}else if(a.dataset.unsubscribe)await h(`/api/v1/admin/prospects/${a.dataset.unsubscribe}/unsubscribe`,{method:"POST"}),await c();else if(a.dataset.erase){if(!confirm("\xBFSuprimir definitivamente este contacto y, si existe, su cuenta?"))return;await h(`/api/v1/admin/prospects/${a.dataset.erase}`,{method:"DELETE"}),await c()}else if(a.hasAttribute("data-retention")){let o=await h("/api/v1/admin/maintenance/retention",{method:"POST"});await c(),t.querySelector("[data-count]").textContent+=` \xB7 ${o.leadsDeleted} solicitudes suprimidas por retenci\xF3n`}}catch(o){d(`No se pudo completar la acci\xF3n: ${o.message}`)}finally{a.disabled=!1}}}),await c()}var st={home_visit:"Apertura consentida de portada (carga de p\xE1gina; no visitantes \xFAnicos)",locked_tool_open:"Apertura de herramienta bloqueada (opcional)",access_requested:"Solicitud de acceso",contact_verified:"Contacto verificado (total)",contact_verified_email:"Contacto verificado \xB7 correo",contact_verified_whatsapp:"Contacto verificado \xB7 WhatsApp",first_expanded_query:"Primera consulta \xFAtil (con datos mostrados)",agricultural_profile_completed:"Perfil agr\xEDcola completado",commercial_authorized:"Primera autorizaci\xF3n comercial",installation_interest:"Primer inter\xE9s en instalaci\xF3n (intenci\xF3n expl\xEDcita)"},w=t=>`${t.numerator} / ${t.denominator} \xB7 ${t.percent==null?"sin denominador":`${t.percent}%`}`,B=t=>`${t.toFixed(2)} \u20AC`;async function F(t){let i=new Date().toISOString().slice(0,10),e=new Date(Date.now()-30*864e5).toISOString().slice(0,10);t.innerHTML=`<h2>Captaci\xF3n y activaci\xF3n</h2><form class="rule-form" data-period>
    <label>Desde<input name="from" type="date" required value="${e}"></label>
    <label>Hasta<input name="to" type="date" required value="${i}"></label>
    <label>Coste publicitario del per\xEDodo (\u20AC)<input name="cost" type="number" step="0.01" min="0" value=""></label>
    <button>Consultar m\xE9tricas</button></form>
    <p class="error" role="alert" data-error></p><div data-report></div>`;async function d(){let c=t.querySelector("form"),v=c.querySelector("button");if(!v.disabled){v.disabled=!0,t.querySelector("[data-error]").textContent="";try{let r=new FormData(c),a=Number(r.get("cost")||0),o=await h(`/api/v1/admin/analytics?${new URLSearchParams(new FormData(c))}`),{total:b,rates:$}=o,g=a>0?`<p>Coste por registro confirmado (cuenta verificada): ${a>0&&b.verified>0?B(a/b.verified):"sin denominador"} \xB7 Coste por solicitud cualificada (perfil agr\xEDcola completo): ${o.leads?.total?.qualified>0?B(a/o.leads.total.qualified):"sin denominador"}. Ejemplo aritm\xE9tico, no previsi\xF3n de resultados.</p>`:"";t.querySelector("[data-report]").innerHTML=`<h3>Eventos del per\xEDodo</h3>
        <p>Medici\xF3n nueva desde el despliegue, sin reconstruir eventos hist\xF3ricos. Solicitudes de enlace son emisiones nuevas, no personas \xFAnicas; solicitudes web se deduplican.</p>
        <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Total</th><th>Unidad / denominador</th></tr></thead><tbody>${Object.entries(st).map(([m,T])=>`<tr><th scope="row">${T}</th><td>${b.events[m]}</td><td>${["home_visit","locked_tool_open"].includes(m)?"Aperturas consentidas, una por carga; no usuarios \xFAnicos ni tasa de conversi\xF3n":"Primera ocurrencia por sujeto; solicitudes de enlace por emisi\xF3n. Conteo, sin porcentaje secuencial"}</td></tr>`).join("")}</tbody></table></div>
        <h3>Cohorte de cuentas registradas en el per\xEDodo \xB7 estado actual</h3>
        <p>${b.registered} cuentas. Correo o canal verificado: ${w($.verified)}. Activaci\xF3n: ${w($.activated)}. Perfil agr\xEDcola completo y verificado: ${w($.agricultural)}. Autorizaci\xF3n vigente: ${w($.authorized)}. Instalaci\xF3n: ${w($.installation)}.</p>
        <p>Denominador: cuentas viewer creadas en el mismo per\xEDodo y canal. Cada porcentaje es independiente, no una etapa condicionada por la anterior. Los registros borrados dejan de formar parte de esta cohorte.</p>
        <p>P\xFAblico relevante: ${b.verifiedAgriculturalAuthorized} perfiles agr\xEDcolas completos y verificados con permiso comercial vigente; ${b.agriculturalInstallation} perfiles agr\xEDcolas completos con inter\xE9s en instalaci\xF3n. La exportaci\xF3n comercial aplica adem\xE1s el canal y alcance de la bandeja.</p>
        <div class="table-wrap"><table><caption>Origen permitido: source \xB7 medium \xB7 campaign. Los valores fuera de ANALYTICS_CAMPAIGNS se agrupan como \xABnone\xBB</caption><thead><tr><th>Canal</th><th>Visitas consentidas</th><th>Solicitudes</th><th>Cuentas</th><th>Verificadas / cuentas</th><th>Agr\xEDcolas verificadas / cuentas</th><th>Permiso vigente / cuentas</th><th>Instalaci\xF3n / cuentas</th></tr></thead><tbody>${o.channels.map(m=>`<tr><th scope="row">${s(m.bucket.split("|").join(" \xB7 "))}</th><td>${m.events.home_visit}</td><td>${m.events.access_requested}</td><td>${m.registered}</td><td>${w(m.rates.verified)}</td><td>${w(m.rates.agricultural)}</td><td>${w(m.rates.authorized)}</td><td>${w(m.rates.installation)}</td></tr>`).join("")||'<tr><td colspan="8">Sin datos en este per\xEDodo.</td></tr>'}</tbody></table></div>
        ${g}
        ${Object.values(o.definitions).map(m=>`<p class="hint">${s(m)}</p>`).join("")}`,t.querySelector("[data-report]").insertAdjacentHTML("beforeend",`<h3>Interesados agr\xEDcolas por canal</h3><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Agr\xEDcolas verificados con permiso vigente</th><th>Agr\xEDcolas con inter\xE9s en instalaci\xF3n</th></tr></thead><tbody>${o.channels.map(m=>`<tr><th scope="row">${s(m.bucket.split("|").join(" \xB7 "))}</th><td>${m.verifiedAgriculturalAuthorized}</td><td>${m.agriculturalInstallation}</td></tr>`).join("")||'<tr><td colspan="3">Sin datos.</td></tr>'}</tbody></table></div>`);let A=o.leads;A&&t.querySelector("[data-report]").insertAdjacentHTML("beforeend",`<h3>Solicitudes de finca (leads) \xB7 serie separada, no se suman a las cuentas</h3>
          <p>${A.total.registered} solicitudes. Cualificadas (perfil agr\xEDcola completo): ${w(A.rates.qualified)}. Permiso comercial vigente: ${w(A.rates.authorized)}.</p>
          <div class="table-wrap"><table><thead><tr><th>Canal</th><th>Solicitudes</th><th>Cualificadas / solicitudes</th><th>Permiso vigente / solicitudes</th></tr></thead><tbody>${A.channels.map(m=>`<tr><th scope="row">${s(m.bucket.split("|").join(" \xB7 "))}</th><td>${m.registered}</td><td>${w(m.rates.qualified)}</td><td>${w(m.rates.authorized)}</td></tr>`).join("")||'<tr><td colspan="4">Sin datos en este per\xEDodo.</td></tr>'}</tbody></table></div>
          <p class="hint">Una solicitud de finca sin cuenta aparece solo en esta serie. La relaci\xF3n lead\u2194cuenta no se resuelve aqu\xED, as\xED que no se suman como personas.</p>`),x(t)}catch(r){t.querySelector("[data-error]").textContent=`No se pudieron cargar las m\xE9tricas: ${r.message}`}finally{v.disabled=!1}}}t.querySelector("form").addEventListener("submit",c=>{c.preventDefault(),c.stopPropagation(),d()}),await d()}var it=["admin","operator","viewer"],nt=["free","pro","enterprise"],ot=["nuevo","contactado","interesado","piloto_activo","cliente","descartado"],dt={nuevo:"Nuevo",contactado:"Contactado",interesado:"Interesado",piloto_activo:"Piloto activo",cliente:"Cliente",descartado:"Descartado"},V={agricultura:"Agricultura",ganaderia:"Ganader\xEDa",mixta:"Agricultura y ganader\xEDa",otra:"Otra"},J=["email","whatsapp"],O={email:"Correo",whatsapp:"WhatsApp"};function W(t){let i=J.filter(e=>t?.[e]===!0);return i.length?i.map(e=>`<span class="badge badge-valid">${O[e]}</span>`).join(" "):'<span class="badge badge-invalid">sin publicidad</span>'}function Q(t,i,e){return J.map(d=>{let c=e?.[d]===!0;return`<button type="button" class="quiet" data-consent-scope="${t}" data-consent-id="${i}"
      data-consent-channel="${d}" data-consent-action="${c?"revoked":"granted"}">
      ${c?"Quitar":"Dar"} ${O[d]}</button>`}).join(" ")}var ct={heladas:"Heladas",calor:"Golpes de calor",tormentas:"Tormentas",viento:"Viento",humedad:"Humedad",general:"Informaci\xF3n general",futura_instalacion:"Futura instalaci\xF3n"};function G(t){let i=t.contacts??[],e=t.consents??{},d=(r,a)=>{let o=e?.[r]?.[a];return o?o.granted?`s\xED \xB7 ${s(o.textVersion||"")}`:"no":"\u2014"};return`<details><summary>Contactos y permisos</summary>
    <table><thead><tr><th>Canal</th><th>Direcci\xF3n</th><th>Verificado</th><th>Avisos</th><th>Servicio</th><th>Publicidad</th></tr></thead>
    <tbody>${i.map(r=>`<tr>
      <td>${O[r.channel]||s(r.channel)}</td>
      <td>${s(r.address||"\u2014")}</td>
      <td>${r.verified?"s\xED":"no"}</td>
      <td>${r.optedIn?"s\xED":"no"}</td>
      <td>${d("service",r.channel)}</td>
      <td>${d("commercial",r.channel)}</td>
    </tr>`).join("")||'<tr><td colspan="6">Sin contactos declarados.</td></tr>'}</tbody></table></details>`}function rt(t){let i=t.profile?[t.profile.activity&&(V[t.profile.activity]||t.profile.activity),t.profile.municipality,t.profile.cropOrLivestock].filter(Boolean).join(" \xB7 "):"";return`<tr>
    <td>${s(t.email)}<br>
      <span class="badge badge-muted">registrado</span>
      ${t.verified?'<span class="badge badge-valid">verificado</span>':'<span class="badge badge-warn">sin verificar</span>'}
      ${t.active?"":'<span class="badge badge-invalid">desactivado</span>'}
      ${i?`<div class="alert-detail">${s(i)}</div>`:""}
      ${G(t)}</td>
    <td><select data-role="${t.id}">${it.map(e=>`<option value="${e}" ${t.role===e?"selected":""}>${H(e)}</option>`).join("")}</select></td>
    <td><select data-plan="${t.id}">${nt.map(e=>`<option value="${e}" ${t.plan===e?"selected":""}>${M(e)}</option>`).join("")}</select></td>
    <td><label class="check"><input type="checkbox" data-active="${t.id}" ${t.active?"checked":""}> activo</label></td>
    <td>${W(t.commercial)}<div class="row-actions">${Q("subscriber",t.id,t.commercial)}</div></td>
    <td>${t.stationCount} \xB7 ${t.sessionCount} sesiones</td>
    <td class="row-actions">
      <button type="button" data-access="${t.id}" data-email="${s(t.email)}">Accesos</button>
      <button type="button" class="quiet" data-test="${t.id}">Probar aviso</button>
    </td>
  </tr>`}function lt(t){let i=String(t.address||""),e=i.startsWith("+")?i.replace(/[^\d]/g,""):"",d=t.body||t.subject||"",c=t.expiresAt&&new Date(t.expiresAt).getTime()<=Date.now(),v=e&&!c?`https://wa.me/${e}?text=${encodeURIComponent(d)}`:"",r=t.templateName?`Plantilla: ${s(t.templateName)}${t.templateLanguage?` (${s(t.templateLanguage)})`:""}`:"Sin plantilla: env\xEDo manual";return`<tr>
    <td>${y(t.createdAt)}<div class="alert-detail">${r}</div>${t.expiresAt?`<div class="alert-detail">${c?"Caducado":`Caduca ${y(t.expiresAt)}`}</div>`:""}</td>
    <td>${s(t.address)}</td>
    <td><details><summary>Ver mensaje</summary><pre>${s(d)}</pre></details></td>
    <td class="row-actions">
      ${v?`<a class="button-link" href="${s(v)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`:""}
      ${c?'<span class="badge badge-invalid">No enviar</span>':`<button type="button" data-outbox-sent="${s(t.id)}">Marcar enviado</button>`}
    </td>
  </tr>`}function pt(t){let i=[t.phone,t.email].filter(Boolean).join(" \xB7 "),e=[V[t.activity]||t.activity,t.cropOrLivestock,ct[t.interest]||t.interest].filter(Boolean).join(" \xB7 "),d=!t.requestType&&!t.preferredChannel,c=t.requestType==="installation_info"?'<span class="badge badge-valid">Consulta de instalaci\xF3n</span>':t.requestType==="pilot"?'<span class="badge badge-muted">Piloto</span>':d?'<span class="badge badge-muted">Legado \xB7 sin modalidad declarada</span>':"",v=t.preferredChannel?`<span class="badge badge-muted">${t.preferredChannel==="whatsapp"?"WhatsApp":"Email"}</span>`:"",r=t.campaign?.source||t.campaign?.campaign?`<div class="alert-detail">captaci\xF3n: ${s([t.campaign.source,t.campaign.campaign].filter(Boolean).join(" \xB7 "))}</div>`:"",a=t.nextContactAt?`<div class="alert-detail">pr\xF3ximo contacto: ${y(t.nextContactAt)}</div>`:"";return`<tr>
    <td>${s(t.name)}<div class="alert-detail">${s(i||"\u2014")}</div>${c}${v}${r}${G(t)}</td>
    <td>${s(t.zone||"\u2014")}<div class="alert-detail">${s(e||"\u2014")}</div>${a}</td>
    <td>${y(t.createdAt)}</td>
    <td><select data-lead-status="${t.id}">${ot.map(o=>`<option value="${o}" ${t.status===o?"selected":""}>${dt[o]}</option>`).join("")}</select></td>
    <td>${W(t.commercial)}<div class="row-actions">${Q("lead",t.id,t.commercial)}</div></td>
    <td class="row-actions">
      <button type="button" data-next-contact="${t.id}">Pr\xF3ximo contacto</button>
      <button type="button" data-activate="${t.id}" data-email="${s(t.email||"")}">Crear cuenta</button>
    </td>
  </tr>`}function ut(t){let i=t.status==="approved"?'<span class="badge badge-valid">Aprobada</span>':t.status==="rejected"?'<span class="badge badge-invalid">Rechazada</span>':'<span class="badge badge-warn">Pendiente</span>',e=t.status!=="pending"?`<br><small>${s(t.decided_by||"")} ${y(t.decided_at)}${t.decision_notes?` \xB7 ${s(t.decision_notes)}`:""}</small>`:"",d=t.status==="pending"?`<button type="button" data-approve="${s(t.subscriber_id)}/${s(t.id)}">Aprobar</button>
       <button type="button" class="quiet" data-reject="${s(t.subscriber_id)}/${s(t.id)}">Rechazar</button>`:"";return`<tr>
    <td>${s(t.farm_name)}<div class="alert-detail">${s(t.location||"")}</div></td>
    <td>${s(t.subscriber_email)}</td>
    <td>${s(t.contact||"\u2014")}</td>
    <td>${y(t.created_at)}${e}</td>
    <td>${i}</td>
    <td class="row-actions">${d}</td>
  </tr>`}function mt(t){return`<tr>
    <td>${y(t.createdAt)}</td>
    <td>${s(t.actorEmail||"\u2014")}</td>
    <td>${s(t.action)}</td>
    <td>${s(t.targetType||"")} ${s(t.targetId||"")}</td>
    <td>${s(t.ipAddress||"\u2014")}</td>
    <td><details><summary>Ver</summary><pre>${s(JSON.stringify({antes:t.beforeJson,despu\u00E9s:t.afterJson},null,2))}</pre></details></td>
  </tr>`}async function xt(t){if(!D()){t.innerHTML='<section class="panel"><p class="empty">Esta secci\xF3n es solo para administradores.</p></section>';return}t.innerHTML=`
    <div class="admin-view">
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
    </section>
    </div>`;let i=(u,n)=>{let l=p(`section[data-panel="${u}"] > [data-error]`,t);l&&(l.textContent=n)};async function e(){let{subscribers:u,counts:n}=await h("/api/v1/admin/subscribers");p("[data-subscribers]",t).innerHTML=u.map(rt).join(""),n&&(p("[data-audience-counts]",t).textContent=`Registrados: ${n.registered} \xB7 Verificados: ${n.verified} \xB7 Autorizados para publicidad: ${n.advertising}`),x(t)}async function d(){let{outbox:u}=await h("/api/v1/admin/outbox?status=manual");p("[data-manual]",t).innerHTML=u.map(lt).join("")||'<tr><td colspan="4">No hay env\xEDos manuales pendientes.</td></tr>',x(t)}async function c(){let{requests:u}=await h("/api/v1/admin/pilot-requests");p("[data-pilots]",t).innerHTML=u.map(ut).join("")||'<tr><td colspan="6">Sin solicitudes de piloto.</td></tr>',x(t)}async function v(){let{leads:u}=await h("/api/v1/admin/leads");p("[data-leads]",t).innerHTML=u.map(pt).join("")||'<tr><td colspan="6">Sin solicitudes web.</td></tr>',x(t)}async function r(){let u=await h("/api/v1/admin/audit?limit=100");p("[data-audit]",t).innerHTML=u.entries.map(mt).join("")||'<tr><td colspan="6">Sin registros de auditor\xEDa.</td></tr>',x(t)}let a=(u,n)=>Promise.all(n.map(l=>l().catch(f=>i(u,f.message)))),o={async usuarios(){i("usuarios",""),await a("usuarios",[e,d,c])},async captacion(){i("captacion",""),await a("captacion",[v]),await z(p("[data-prospects]",t)),await F(p("[data-analytics]",t))},async estadisticas(){await q(p("[data-statistics-panel]",t))},async auditoria(){i("auditoria",""),await a("auditoria",[r])}},b=new Set,$=new Set,g=null;async function A(u){if(g!==u){g=u;for(let n of t.querySelectorAll("[data-panel]"))n.classList.toggle("hidden",n.dataset.panel!==u);t.querySelectorAll("[data-tab]").forEach(n=>{let l=n.dataset.tab===u;n.classList.toggle("active",l),n.setAttribute("aria-selected",l?"true":"false")});try{(!b.has(u)||$.has(u))&&(b.add(u),$.delete(u),await o[u]())}catch(n){i(u,`No se pudo cargar la secci\xF3n: ${n.message}`)}}}t.addEventListener("input",u=>{let n=u.target.closest("input[data-search]");if(!n)return;let l=p(`[data-tbody="${n.dataset.search}"]`,t);if(!l)return;let f=n.value.trim().toLowerCase();for(let _ of l.rows)_.classList.toggle("hidden",!!f&&!_.textContent.toLowerCase().includes(f))});async function m(u){p("[data-access-panel]",t).classList.remove("hidden"),p("[data-access-title]",t).textContent=`Estaciones autorizadas \xB7 #${u}`;let l=await h(`/api/v1/admin/subscribers/${u}/access`);p("[data-granted]",t).innerHTML=l.granted.map(f=>`<li>${s(f.name)} <small>${s(f.id)}</small>
        <button type="button" class="quiet" data-revoke="${s(f.id)}" data-subscriber="${l.subscriber.id}">Quitar</button></li>`).join("")||'<li class="empty">Sin estaciones concedidas.</li>',p("[data-available]",t).innerHTML=l.available.map(f=>`<li>${s(f.name)} <small>${s(f.id)}</small>
        <button type="button" data-grant="${s(f.id)}" data-subscriber="${l.subscriber.id}">Conceder</button></li>`).join("")||'<li class="empty">No quedan estaciones disponibles.</li>'}let T=async(u,n)=>{try{await h(`/api/v1/admin/subscribers/${u}`,{method:"PATCH",body:JSON.stringify(n)}),await e()}catch(l){i("usuarios",`No se pudo actualizar el usuario: ${l.message}`),await e()}};t.onchange=async u=>{let n=u.target;if(n.dataset.role)await T(n.dataset.role,{role:n.value});else if(n.dataset.plan)await T(n.dataset.plan,{plan:n.value});else if(n.dataset.active)await T(n.dataset.active,{active:n.checked});else if(n.dataset.leadStatus)try{await h(`/api/v1/admin/leads/${n.dataset.leadStatus}`,{method:"PATCH",body:JSON.stringify({status:n.value})}),await v()}catch(l){i("captacion",`No se pudo actualizar la solicitud: ${l.message}`)}},t.onclick=async u=>{let n=u.target.closest("button");if(n){if(n.dataset.tab){await A(n.dataset.tab);return}if(!n.disabled){n.disabled=!0;try{if(n.dataset.access)await m(n.dataset.access);else if(n.dataset.accessClose!==void 0)p("[data-access-panel]",t).classList.add("hidden");else if(n.dataset.grant)await h(`/api/v1/admin/subscribers/${n.dataset.subscriber}/access`,{method:"POST",body:JSON.stringify({device_id:n.dataset.grant})}),await m(n.dataset.subscriber);else if(n.dataset.revoke)await h(`/api/v1/admin/subscribers/${n.dataset.subscriber}/access/${encodeURIComponent(n.dataset.revoke)}`,{method:"DELETE"}),await m(n.dataset.subscriber);else if(n.dataset.consentScope){let l=n.dataset.consentScope,f=l==="subscriber"?`/api/v1/admin/subscribers/${n.dataset.consentId}/consents`:`/api/v1/admin/leads/${n.dataset.consentId}/consents`;await h(f,{method:"POST",body:JSON.stringify({channel:n.dataset.consentChannel,action:n.dataset.consentAction})}),l==="subscriber"?await e():(await v(),$.add("usuarios"))}else if(n.dataset.nextContact){let l=window.prompt("Fecha del pr\xF3ximo contacto (AAAA-MM-DD, vac\xEDo para borrar):","");if(l===null)return;let f=l?new Date(`${l}T09:00:00`).toISOString():null;await h(`/api/v1/admin/leads/${n.dataset.nextContact}`,{method:"PATCH",body:JSON.stringify({next_contact_at:f})}),await v()}else if(n.dataset.activate){let l=window.prompt("Correo del nuevo suscriptor:",n.dataset.email||"")||"";if(!l)return;let f=await h(`/api/v1/admin/leads/${n.dataset.activate}/activate`,{method:"POST",body:JSON.stringify({email:l})});window.alert(`Suscriptor creado: ${f.subscriber.email}
Contrase\xF1a temporal (se muestra una sola vez): ${f.temporaryPassword}`),await v(),$.add("usuarios")}else if(n.dataset.test){let l=await h(`/api/v1/admin/subscribers/${n.dataset.test}/test-message`,{method:"POST"});window.alert(l.ok?`Prueba enviada por ${l.channel} a ${l.address}.`:`No se pudo enviar la prueba: ${l.error}`)}else if(n.dataset.outboxSent)await h(`/api/v1/admin/outbox/${n.dataset.outboxSent}`,{method:"PATCH",body:JSON.stringify({status:"sent"})}),await d();else if(n.dataset.approve||n.dataset.reject){let[l,f]=(n.dataset.approve||n.dataset.reject).split("/"),_=n.dataset.approve?"approved":"rejected",I=window.prompt("Notas de la decisi\xF3n (opcional):","")||void 0;await h(`/api/v1/admin/pilot-requests/${l}/${encodeURIComponent(f)}`,{method:"PATCH",body:JSON.stringify({status:_,...I?{decision_notes:I}:{}})}),await c()}}catch(l){i(g,`No se pudo completar la acci\xF3n: ${l.message}`)}finally{n.disabled=!1}}}},await A("usuarios")}export{xt as renderAdmin};
