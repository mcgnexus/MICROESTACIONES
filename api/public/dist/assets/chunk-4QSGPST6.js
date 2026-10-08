import{b as w}from"./chunk-4L6TDCRN.js";import{b as E,e as _}from"./chunk-ZWOJUT3D.js";import{a as l,b as n,c as m,e as $,g as u,h as v,j as d,k as y,l as f,u as g,v as h,w as b}from"./chunk-6I6L4YVC.js";var x={pending:"pendiente",sent:"enviado",delivered:"entregado",failed:"fallido",bounced:"rebotado",manual:"manual"},T={frost:"Heladas",heat:"Calor",storm:"Tormentas",wind:"Viento",humidity:"Humedad",general:"General"};function S(){let e=v.support?.whatsappDelivery;return e?e==="manual"?`<p class="hint">${n(E)}</p>`:e==="disabled"?'<p class="hint">A\xFAn no hay entrega por WhatsApp configurada: los avisos quedan en la aplicaci\xF3n.</p>':'<p class="hint">Los avisos salen por los canales que hayas autorizado y verificado; puedes darte de baja cuando quieras.</p>':""}function O(e){if(e==null)return"sin fecha de medida";if(e<90)return`medida de hace ${e} s`;let i=Math.round(e/60);return i<90?`medida de hace ${i} min`:`medida de hace ${Math.round(i/60)} h`}function A(e){let i=Number(e)||0;return i===0?"inmediata":i<60?`${i} s`:i<3600?`${Math.round(i/60)} min`:`${Number((i/3600).toFixed(1))} h`}function R(e,i){let r=e.ruleSnapshot?.metric==="pressure",t=r&&typeof e.value=="number"?`${u(e.value)} mbar`:JSON.stringify(e.value),o=e.closedAt?`<span class="badge badge-muted">${e.autoResolved?"Recuperado":"Cerrado"} ${m(e.closedAt)}${e.closureReason?` \xB7 ${n(e.closureReason)}`:""}</span>`:'<span class="badge badge-warn">Abierto</span>',a=e.acknowledgedAt?`<span class="badge badge-valid">Reconocido ${m(e.acknowledgedAt)}</span>`:'<span class="badge badge-invalid">Sin reconocer</span>',s=e.ruleId?`<span class="source-tag">Regla ${n(g[e.ruleSnapshot?.metric]||e.ruleSnapshot?.metric||"")} ${n(h[e.ruleSnapshot?.comparator]||"")} ${r?`${u(e.ruleSnapshot?.threshold)} mbar`:n(e.ruleSnapshot?.threshold??"")}${e.ruleSnapshot?.min_duration_s?` \xB7 exige ${A(e.ruleSnapshot.min_duration_s)}`:""}${e.ruleSnapshot?.margin?` \xB7 margen ${r?`${u(e.ruleSnapshot.margin)} mbar`:n(String(e.ruleSnapshot.margin))}`:""}${e.ruleSnapshot?.urgent?" \xB7 urgente":""}</span>`:"",c=i?[!e.acknowledgedAt&&!e.closedAt?`<button type="button" data-ack="${n(e.id)}">Reconocer</button>`:"",e.closedAt?"":`<button type="button" class="quiet" data-close="${n(e.id)}">Cerrar</button>`,e.closedAt?`<button type="button" class="quiet" data-reopen="${n(e.id)}">Reabrir</button>`:"",f()?`<button type="button" class="danger" data-delete-alert="${n(e.id)}">Borrar</button>`:""].join(" "):"";return`<tr>
    <td>${e.level===1?"Prioritario":"Aviso"}</td>
    <td><strong>${n(e.message)}</strong>${s?`<br>${s}`:""}
      <div class="alert-detail">
        <span class="badge ${e.ageSeconds>1800?"badge-warn":"badge-muted"}">${O(e.ageSeconds)}</span>
        ${e.ingestDelaySeconds!=null?` \xB7 tard\xF3 ${A(e.ingestDelaySeconds)} en llegar`:""}
        \xB7 recibido ${m(e.createdAt)}
      </div></td>
    <td>${n(e.deviceName)}</td>
    <td>${n(t)}</td>
    <td>${n(e.source||"\u2014")}</td>
    <td>${n(e.recipient||"\u2014")}${e.channel?` \xB7 ${n(b[e.channel]||e.channel)}`:""}
      ${e.deliveryStatus?`<br><span class="badge badge-muted">${n(x[e.deliveryStatus]||e.deliveryStatus)}</span>`:""}</td>
    <td>${o}<br>${a}</td>
    <td class="row-actions">${c}</td>
  </tr>`}function M(e,i){let r=e.metric==="pressure",t=r?`${u(e.threshold)} mbar`:$(e.threshold),o=r?`${u(e.recoveryMargin)} mbar`:$(e.recoveryMargin),a=i&&!e.system?[`<button type="button" data-toggle-rule="${e.id}" data-next="${e.enabled?"false":"true"}">${e.enabled?"Desactivar":"Activar"}</button>`,`<button type="button" class="danger" data-delete-rule="${e.id}">Eliminar</button>`].join(" "):"",s=e.conditionActive?`<span class="badge badge-warn" title="Desde ${m(e.conditionSince)}">Condici\xF3n activa</span>`:'<span class="badge badge-muted">Inactiva</span>';return`<tr${e.system?' class="row-system"':""}>
    <td>${n(g[e.metric]||e.metric)}${e.system?' <span class="badge badge-muted">sistema</span>':""}${e.category&&e.category!=="general"?`<br><small>${n(T[e.category]||e.category)}</small>`:""}</td>
    <td>${n(h[e.comparator]||e.comparator)} ${t}</td>
    <td>${n(A(e.minDurationS))}</td>
    <td>${o}</td>
    <td>${e.urgent?'<span class="badge badge-invalid">urgente</span>':"\u2014"}</td>
    <td>${n(e.message)}</td>
    <td>${n(e.recipient||"\u2014")}<br><small>${n(b[e.channel]||e.channel)}</small></td>
    <td>${e.enabled?s:'<span class="badge badge-muted">Desactivada</span>'}</td>
    <td class="row-actions">${a}</td>
  </tr>`}async function D(e,i){let r=y(),t=await d(`/api/v1/alerts?device_id=${encodeURIComponent(i)}&status=all&limit=100`);if(!r){let a=t.not_subscribed?'<p class="hint">Est\xE1s viendo esta estaci\xF3n por la demostraci\xF3n, pero no est\xE1s suscrito a sus avisos: los avisos solo llegan a quien tiene la estaci\xF3n concedida.</p>':"";e.innerHTML=`<section class="panel">
      <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Qu\xE9 se ha observado</h2></div></div>
      ${w(t.alerts,v.me?.farms||[],{technical:!1,engineVerified:t.engine_verified!==!1})}
      ${a}
      <p class="hint">Cada aviso indica su categor\xEDa, su fuente, su fecha, su estado y su vigencia, y si es un dato real,
        una previsi\xF3n, un c\xE1lculo o una simulaci\xF3n. Las reglas y los destinatarios no se muestran en la demostraci\xF3n.</p>
      ${S()}
    </section>`;return}let o=await d(`/api/v1/alerts/rules?device_id=${encodeURIComponent(i)}`);e.innerHTML=`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Historial de avisos</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nivel</th><th>Aviso</th><th>Estaci\xF3n</th><th>Dato</th><th>Fuente</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${t.alerts.map(a=>R(a,r)).join("")||'<tr><td colspan="8">Sin avisos registrados.</td></tr>'}</tbody>
    </table></div>
    ${t.engine_verified===!1?'<p class="warn-box">El motor de avisos no est\xE1 comprobado en esta instalaci\xF3n: los avisos de umbral local no se presentan como tales.</p>':""}
    ${S()}
  </section>
  ${L(o.rules||[],i,r)}
  <p class="error" data-alert-error role="alert"></p>`,j(e,i,()=>D(e,i))}function L(e,i,r){return`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">REGLAS</p><h2>Umbrales de aviso</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>M\xE9trica</th><th>Condici\xF3n</th><th>Exige</th><th>Margen</th><th>Urgente</th><th>Mensaje</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${e.map(t=>M(t,r)).join("")||'<tr><td colspan="9">Sin reglas definidas.</td></tr>'}</tbody>
    </table></div>
    <p class="hint">Una regla solo avisa si la condici\xF3n se sostiene durante el tiempo indicado y no vuelve
      a la normalidad hasta pasar el margen: as\xED no se repite el mismo aviso por valores l\xEDmites.
      Las reglas de sistema (sin comunicaci\xF3n y bater\xEDa baja) los mantiene el servidor.</p>
    ${r?`<form data-rule-form class="rule-form">
      <label>M\xE9trica<select name="metric">${Object.entries(g).map(([t,o])=>`<option value="${t}">${o}</option>`).join("")}</select></label>
      <label>Condici\xF3n<select name="comparator">${Object.entries(h).map(([t,o])=>`<option value="${t}">${n(o)}</option>`).join("")}</select></label>
      <label data-threshold-label>Umbral<input type="number" step="any" name="threshold" required></label>
      <label>Nivel<select name="level"><option value="2">Aviso</option><option value="1">Prioritario</option></select></label>
      <label>Categor\xEDa<select name="category">${Object.entries(T).map(([t,o])=>`<option value="${t}" ${t==="general"?"selected":""}>${n(o)}</option>`).join("")}</select></label>
      <label>Se sostiene (s)<input type="number" name="min_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label data-margin-label>Margen de recuperaci\xF3n<input type="number" name="recovery_margin" min="0" step="any" value="0"></label>
      <label>Recuperaci\xF3n a (valor)<input type="number" step="any" name="recovery_threshold" placeholder="opcional"></label>
      <label>Recuperaci\xF3n sostenida (s)<input type="number" name="recovery_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label>No repetir (s)<input type="number" name="cooldown_s" min="0" max="604800" step="60" value="0"></label>
      <label>Mensaje<input name="message" required maxlength="200"></label>
      <label>Destinatario<input name="recipient" maxlength="200" placeholder="correo o tel\xE9fono"></label>
      <label>Canal<select name="channel">${Object.entries(b).map(([t,o])=>`<option value="${t}" ${t==="in_app"?"selected":""}>${n(o)}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="urgent"> Urgente: pedir env\xEDo inmediato</label>
      <button type="submit">Crear regla</button>
    </form>`:""}
  </section>`}function j(e,i,r){e.onclick=async o=>{let a=o.target.closest("button");if(a)try{if(a.dataset.ack)await d(`/api/v1/alerts/${a.dataset.ack}/acknowledge`,{method:"POST",body:JSON.stringify({})});else if(a.dataset.close){let s=window.prompt("Motivo del cierre (opcional):","")||void 0;await d(`/api/v1/alerts/${a.dataset.close}/close`,{method:"POST",body:JSON.stringify(s?{reason:s}:{})})}else if(a.dataset.reopen)await d(`/api/v1/alerts/${a.dataset.reopen}/reopen`,{method:"POST",body:JSON.stringify({})});else if(a.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await d(`/api/v1/alerts/${a.dataset.deleteAlert}`,{method:"DELETE"})}else if(a.dataset.toggleRule)await d(`/api/v1/alerts/rules/${a.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:a.dataset.next==="true"})});else if(a.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await d(`/api/v1/alerts/rules/${a.dataset.deleteRule}`,{method:"DELETE"})}else return;await r()}catch(s){l("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${s.message}`}};let t=l("[data-rule-form]",e);if(t){let o=()=>{let a=t.elements.metric.value==="pressure";l("[data-threshold-label]",t).firstChild.textContent=a?"Umbral (mbar)":"Umbral",l("[data-margin-label]",t).firstChild.textContent=a?"Margen de recuperaci\xF3n (mbar)":"Margen de recuperaci\xF3n"};t.elements.metric.addEventListener("change",o),o(),t.addEventListener("submit",async a=>{a.preventDefault();let s=new FormData(t);try{await d("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(C(s,i))}),await r()}catch(c){l("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${c.message}`}})}}function C(e,i){let r=e.get("metric"),t=r==="pressure"?100:1,o={device_id:i,metric:r,comparator:e.get("comparator"),threshold:Number(e.get("threshold"))*t,level:Number(e.get("level")),message:e.get("message"),channel:e.get("channel"),category:e.get("category")||"general",min_duration_s:Number(e.get("min_duration_s")||0),recovery_margin:Number(e.get("recovery_margin")||0)*t,recovery_duration_s:Number(e.get("recovery_duration_s")||0),cooldown_s:Number(e.get("cooldown_s")||0),urgent:e.get("urgent")==="on"};return e.get("recovery_threshold")&&(o.recovery_threshold=Number(e.get("recovery_threshold"))*t),e.get("recipient")&&(o.recipient=e.get("recipient")),o}async function U(e){let i=y();e.innerHTML=`
    <div class="page-heading">
      <div><p class="eyebrow">AVISOS</p><h1>Centro de avisos</h1></div>
    </div>
    <section class="panel">
      <div class="table-filters">
        <label>Estado<select data-filter="status">
          <option value="open">Abiertos</option><option value="closed">Cerrados</option><option value="all">Todos</option></select></label>
        <label>Canal<select data-filter="channel">
          <option value="">Todos</option>${Object.entries(b).map(([a,s])=>`<option value="${a}">${s}</option>`).join("")}</select></label>
        <label>Estaci\xF3n<select data-filter="device"><option value="">Todas</option></select></label>
        <button type="button" data-action="apply">Aplicar</button>
      </div>
      <p class="error" data-alert-error role="alert"></p>
      <p class="coverage" data-counts></p>
      <div data-rows></div>
      <p data-delivery-note></p>
    </section>
    <section class="panel${i?"":" hidden"}" data-rules></section>`;let r=(await d("/api/v1/stations")).stations;l('[data-filter="device"]',e).innerHTML='<option value="">Todas</option>'+r.map(a=>`<option value="${n(a.id)}">${n(a.name)}</option>`).join("");let t=async()=>{l("[data-alert-error]",e).textContent="";let a=new URLSearchParams({status:l('[data-filter="status"]',e).value,limit:"200"}),s=l('[data-filter="channel"]',e).value,c=l('[data-filter="device"]',e).value;s&&a.set("channel",s),c&&a.set("device_id",c);try{let p=await d(`/api/v1/alerts?${a}`),N=_(r);l("[data-rows]",e).innerHTML=w(p.alerts,v.me?.farms||[],{technical:i,caveat:N,engineVerified:p.engine_verified!==!1,admin:f()}),l("[data-counts]",e).textContent=`${p.counts.open} activas \xB7 ${p.counts.closed} cerradas`+(p.engine_verified===!1?" \xB7 motor de avisos sin comprobar":""),i&&(l("[data-rules]",e).innerHTML=L((await d("/api/v1/alerts/rules")).rules||[],c||r[0]?.id,!0)),l("[data-delivery-note]",e).innerHTML=S()}catch(p){l("[data-alert-error]",e).textContent=`No se pudieron cargar los avisos: ${p.message}`}};e.onclick=async a=>{let s=a.target.closest("button");if(s){if(s.dataset.action==="apply"){await t();return}try{if(s.dataset.toggleRule)await d(`/api/v1/alerts/rules/${s.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:s.dataset.next==="true"})});else if(s.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await d(`/api/v1/alerts/rules/${s.dataset.deleteRule}`,{method:"DELETE"})}else if(s.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await d(`/api/v1/alerts/${s.dataset.deleteAlert}`,{method:"DELETE"})}else{let c=s.dataset.ack||s.dataset.close||s.dataset.reopen;if(!c)return;if(s.dataset.ack&&await d(`/api/v1/alerts/${c}/acknowledge`,{method:"POST",body:JSON.stringify({})}),s.dataset.close){let p=window.prompt("Motivo del cierre (opcional):","")||void 0;await d(`/api/v1/alerts/${c}/close`,{method:"POST",body:JSON.stringify(p?{reason:p}:{})})}s.dataset.reopen&&await d(`/api/v1/alerts/${c}/reopen`,{method:"POST",body:JSON.stringify({})})}await t()}catch(c){l("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${c.message}`}}};let o=l("[data-rules]",e);o&&o.addEventListener("submit",async a=>{a.preventDefault();let s=new FormData(a.target),c=l('[data-filter="device"]',e).value||r[0]?.id;if(c)try{await d("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(C(s,c))}),await t()}catch(p){l("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${p.message}`}}),await t()}export{O as a,A as b,D as c,U as d};
