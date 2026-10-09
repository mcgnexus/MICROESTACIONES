import{b as A}from"./chunk-R6NH63MF.js";import{b as _,g as L}from"./chunk-7CRF2GWD.js";import{a as p,b as t,c as b,e as w,g as v,h as y,j as c,k as S,l as $,v as h,w as f,x as g}from"./chunk-44FBHP77.js";var x={pending:"pendiente",sent:"enviado",delivered:"entregado",failed:"fallido",bounced:"rebotado",manual:"manual"},N={frost:"Heladas",heat:"Calor",storm:"Tormentas",wind:"Viento",humidity:"Humedad",general:"General"};function E(){let e=y.support?.whatsappDelivery;return e?e==="manual"?`<p class="hint">${t(_)}</p>`:e==="disabled"?'<p class="hint">A\xFAn no hay entrega por WhatsApp configurada: los avisos quedan en la aplicaci\xF3n.</p>':'<p class="hint">Los avisos salen por los canales que hayas autorizado y verificado; puedes darte de baja cuando quieras.</p>':""}function M(e){if(e==null)return"sin fecha de medida";if(e<90)return`medida de hace ${e} s`;let o=Math.round(e/60);return o<90?`medida de hace ${o} min`:`medida de hace ${Math.round(o/60)} h`}function T(e){let o=Number(e)||0;return o===0?"inmediata":o<60?`${o} s`:o<3600?`${Math.round(o/60)} min`:`${Number((o/3600).toFixed(1))} h`}function R(e,o){let d=e.ruleSnapshot?.metric==="pressure",a=d&&typeof e.value=="number"?`${v(e.value)} mbar`:JSON.stringify(e.value),r=e.closedAt?`<span class="badge badge-muted">${e.autoResolved?"Recuperado":"Cerrado"} ${b(e.closedAt)}${e.closureReason?` \xB7 ${t(e.closureReason)}`:""}</span>`:'<span class="badge badge-warn">Abierto</span>',n=e.acknowledgedAt?`<span class="badge badge-valid">Reconocido ${b(e.acknowledgedAt)}</span>`:'<span class="badge badge-invalid">Sin reconocer</span>',i=e.ruleId?`<span class="source-tag">Regla ${t(h[e.ruleSnapshot?.metric]||e.ruleSnapshot?.metric||"")} ${t(f[e.ruleSnapshot?.comparator]||"")} ${d?`${v(e.ruleSnapshot?.threshold)} mbar`:t(e.ruleSnapshot?.threshold??"")}${e.ruleSnapshot?.min_duration_s?` \xB7 exige ${T(e.ruleSnapshot.min_duration_s)}`:""}${e.ruleSnapshot?.margin?` \xB7 margen ${d?`${v(e.ruleSnapshot.margin)} mbar`:t(String(e.ruleSnapshot.margin))}`:""}${e.ruleSnapshot?.urgent?" \xB7 urgente":""}</span>`:"",s=o?[!e.acknowledgedAt&&!e.closedAt?`<button type="button" data-ack="${t(e.id)}">Reconocer</button>`:"",e.closedAt?"":`<button type="button" class="quiet" data-close="${t(e.id)}">Cerrar</button>`,e.closedAt?`<button type="button" class="quiet" data-reopen="${t(e.id)}">Reabrir</button>`:"",$()?`<button type="button" class="danger" data-delete-alert="${t(e.id)}">Borrar</button>`:""].join(" "):"";return`<tr>
    <td>${e.level===1?"Prioritario":"Aviso"}</td>
    <td><strong>${t(e.message)}</strong>${i?`<br>${i}`:""}
      <div class="alert-detail">
        <span class="badge ${e.ageSeconds>1800?"badge-warn":"badge-muted"}">${M(e.ageSeconds)}</span>
        ${e.ingestDelaySeconds!=null?` \xB7 tard\xF3 ${T(e.ingestDelaySeconds)} en llegar`:""}
        \xB7 recibido ${b(e.createdAt)}
      </div></td>
    <td>${t(e.deviceName)}</td>
    <td>${t(a)}</td>
    <td>${t(e.source||"\u2014")}</td>
    <td>${t(e.recipient||"\u2014")}${e.channel?` \xB7 ${t(g[e.channel]||e.channel)}`:""}
      ${e.deliveryStatus?`<br><span class="badge badge-muted">${t(x[e.deliveryStatus]||e.deliveryStatus)}</span>`:""}</td>
    <td>${r}<br>${n}</td>
    <td class="row-actions">${s}</td>
  </tr>`}function D(e,o){let d=e.metric==="pressure",a=d?`${v(e.threshold)} mbar`:w(e.threshold),r=d?`${v(e.recoveryMargin)} mbar`:w(e.recoveryMargin),n=o&&!e.system?[`<button type="button" data-toggle-rule="${e.id}" data-next="${e.enabled?"false":"true"}">${e.enabled?"Desactivar":"Activar"}</button>`,`<button type="button" class="danger" data-delete-rule="${e.id}">Eliminar</button>`].join(" "):"",i=e.conditionActive?`<span class="badge badge-warn" title="Desde ${b(e.conditionSince)}">Condici\xF3n activa</span>`:'<span class="badge badge-muted">Inactiva</span>';return`<tr${e.system?' class="row-system"':""}>
    <td>${t(h[e.metric]||e.metric)}${e.system?' <span class="badge badge-muted">sistema</span>':""}${e.category&&e.category!=="general"?`<br><small>${t(N[e.category]||e.category)}</small>`:""}</td>
    <td>${t(f[e.comparator]||e.comparator)} ${a}</td>
    <td>${t(T(e.minDurationS))}</td>
    <td>${r}</td>
    <td>${e.urgent?'<span class="badge badge-invalid">urgente</span>':"\u2014"}</td>
    <td>${t(e.message)}</td>
    <td>${t(e.recipient||"\u2014")}<br><small>${t(g[e.channel]||e.channel)}</small></td>
    <td>${e.enabled?i:'<span class="badge badge-muted">Desactivada</span>'}</td>
    <td class="row-actions">${n}</td>
  </tr>`}async function j(e,o){let d=S(),a=await c(`/api/v1/alerts?device_id=${encodeURIComponent(o)}&status=all&limit=100`);if(!d){let n=a.not_subscribed?'<p class="hint">Est\xE1s viendo esta estaci\xF3n por la demostraci\xF3n, pero no est\xE1s suscrito a sus avisos: los avisos solo llegan a quien tiene la estaci\xF3n concedida.</p>':"";e.innerHTML=`<section class="panel">
      <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Qu\xE9 se ha observado</h2></div></div>
      ${A(a.alerts,y.me?.farms||[],{technical:!1,engineVerified:a.engine_verified!==!1})}
      ${n}
      <p class="hint">Cada aviso indica su categor\xEDa, su fuente, su fecha, su estado y su vigencia, y si es un dato real,
        una previsi\xF3n, un c\xE1lculo o una simulaci\xF3n. Las reglas y los destinatarios no se muestran en la demostraci\xF3n.</p>
      ${E()}
    </section>`;return}let r=await c(`/api/v1/alerts/rules?device_id=${encodeURIComponent(o)}`);e.innerHTML=`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Historial de avisos</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nivel</th><th>Aviso</th><th>Estaci\xF3n</th><th>Dato</th><th>Fuente</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${a.alerts.map(n=>R(n,d)).join("")||'<tr><td colspan="8">Sin avisos registrados.</td></tr>'}</tbody>
    </table></div>
    ${a.engine_verified===!1?'<p class="warn-box">El motor de avisos no est\xE1 comprobado en esta instalaci\xF3n: los avisos de umbral local no se presentan como tales.</p>':""}
    ${E()}
  </section>
  ${C(r.rules||[],o,d)}
  <p class="error" data-alert-error role="alert"></p>`,P(e,o,()=>j(e,o))}function C(e,o,d){return`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">REGLAS</p><h2>Umbrales de aviso</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>M\xE9trica</th><th>Condici\xF3n</th><th>Exige</th><th>Margen</th><th>Urgente</th><th>Mensaje</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${e.map(a=>D(a,d)).join("")||'<tr><td colspan="9">Sin reglas definidas.</td></tr>'}</tbody>
    </table></div>
    <p class="hint">Una regla solo avisa si la condici\xF3n se sostiene durante el tiempo indicado y no vuelve
      a la normalidad hasta pasar el margen: as\xED no se repite el mismo aviso por valores l\xEDmites.
      Las reglas de sistema (sin comunicaci\xF3n y bater\xEDa baja) los mantiene el servidor.</p>
    ${d?`<form data-rule-form class="rule-form">
      <label>M\xE9trica<select name="metric">${Object.entries(h).map(([a,r])=>`<option value="${a}">${r}</option>`).join("")}</select></label>
      <label>Condici\xF3n<select name="comparator">${Object.entries(f).map(([a,r])=>`<option value="${a}">${t(r)}</option>`).join("")}</select></label>
      <label data-threshold-label>Umbral<input type="number" step="any" name="threshold" required></label>
      <label>Nivel<select name="level"><option value="2">Aviso</option><option value="1">Prioritario</option></select></label>
      <label>Categor\xEDa<select name="category">${Object.entries(N).map(([a,r])=>`<option value="${a}" ${a==="general"?"selected":""}>${t(r)}</option>`).join("")}</select></label>
      <label>Se sostiene (s)<input type="number" name="min_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label data-margin-label>Margen de recuperaci\xF3n<input type="number" name="recovery_margin" min="0" step="any" value="0"></label>
      <label>Recuperaci\xF3n a (valor)<input type="number" step="any" name="recovery_threshold" placeholder="opcional"></label>
      <label>Recuperaci\xF3n sostenida (s)<input type="number" name="recovery_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label>No repetir (s)<input type="number" name="cooldown_s" min="0" max="604800" step="60" value="0"></label>
      <label>Mensaje<input name="message" required maxlength="200"></label>
      <label>Destinatario<input name="recipient" maxlength="200" placeholder="correo o tel\xE9fono"></label>
      <label>Canal<select name="channel">${Object.entries(g).map(([a,r])=>`<option value="${a}" ${a==="in_app"?"selected":""}>${t(r)}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="urgent"> Urgente: pedir env\xEDo inmediato</label>
      <button type="submit">Crear regla</button>
    </form>`:""}
  </section>`}function P(e,o,d){e.onclick=async r=>{let n=r.target.closest("button");if(n)try{if(n.dataset.ack)await c(`/api/v1/alerts/${n.dataset.ack}/acknowledge`,{method:"POST",body:JSON.stringify({})});else if(n.dataset.close){let i=window.prompt("Motivo del cierre (opcional):","")||void 0;await c(`/api/v1/alerts/${n.dataset.close}/close`,{method:"POST",body:JSON.stringify(i?{reason:i}:{})})}else if(n.dataset.reopen)await c(`/api/v1/alerts/${n.dataset.reopen}/reopen`,{method:"POST",body:JSON.stringify({})});else if(n.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await c(`/api/v1/alerts/${n.dataset.deleteAlert}`,{method:"DELETE"})}else if(n.dataset.toggleRule)await c(`/api/v1/alerts/rules/${n.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:n.dataset.next==="true"})});else if(n.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await c(`/api/v1/alerts/rules/${n.dataset.deleteRule}`,{method:"DELETE"})}else return;await d()}catch(i){p("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${i.message}`}};let a=p("[data-rule-form]",e);if(a){let r=()=>{let n=a.elements.metric.value==="pressure";p("[data-threshold-label]",a).firstChild.textContent=n?"Umbral (mbar)":"Umbral",p("[data-margin-label]",a).firstChild.textContent=n?"Margen de recuperaci\xF3n (mbar)":"Margen de recuperaci\xF3n"};a.elements.metric.addEventListener("change",r),r(),a.addEventListener("submit",async n=>{n.preventDefault();let i=new FormData(a);try{await c("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(O(i,o))}),await d()}catch(s){p("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${s.message}`}})}}function O(e,o){let d=e.get("metric"),a=d==="pressure"?100:1,r={device_id:o,metric:d,comparator:e.get("comparator"),threshold:Number(e.get("threshold"))*a,level:Number(e.get("level")),message:e.get("message"),channel:e.get("channel"),category:e.get("category")||"general",min_duration_s:Number(e.get("min_duration_s")||0),recovery_margin:Number(e.get("recovery_margin")||0)*a,recovery_duration_s:Number(e.get("recovery_duration_s")||0),cooldown_s:Number(e.get("cooldown_s")||0),urgent:e.get("urgent")==="on"};return e.get("recovery_threshold")&&(r.recovery_threshold=Number(e.get("recovery_threshold"))*a),e.get("recipient")&&(r.recipient=e.get("recipient")),r}async function q(e){let o=S();e.innerHTML=`
    <div class="page-heading">
      <div><p class="eyebrow">AVISOS</p><h1>Centro de avisos</h1></div>
    </div>
    <section class="panel">
      <div class="table-filters">
        <label>Estado<select data-filter="status">
          <option value="open">Abiertos</option><option value="closed">Cerrados</option><option value="all">Todos</option></select></label>
        <label>Canal<select data-filter="channel">
          <option value="">Todos</option>${Object.entries(g).map(([i,s])=>`<option value="${i}">${s}</option>`).join("")}</select></label>
        <label>Estaci\xF3n<select data-filter="device"><option value="">Todas</option></select></label>
        <button type="button" data-action="apply">Aplicar</button>
      </div>
      <p class="error" data-alert-error role="alert"></p>
      <p class="coverage" data-counts></p>
      <div data-rows></div>
      <p data-delivery-note></p>
    </section>
    <section class="panel${o?"":" hidden"}" data-rules></section>
    ${$()?`<section class="panel" data-legacy>
      <div class="section-heading"><div><p class="eyebrow">MANTENIMIENTO</p><h2>Avisos heredados</h2></div>
        <button type="button" class="quiet" data-action="review-legacy">Revisar</button></div>
      <p class="hint">Avisos abiertos cuya regla ya no est\xE1 activa, sin regla asociada, o duplicados de un
        mismo episodio. Se agrupan por incidente y se cierran sin borrar su rastro.</p>
      <div data-legacy-body></div>
    </section>`:""}`;let d=(await c("/api/v1/stations")).stations;p('[data-filter="device"]',e).innerHTML='<option value="">Todas</option>'+d.map(i=>`<option value="${t(i.id)}">${t(i.name)}</option>`).join("");let a=async()=>{p("[data-alert-error]",e).textContent="";let i=new URLSearchParams({status:p('[data-filter="status"]',e).value,limit:"200"}),s=p('[data-filter="channel"]',e).value,u=p('[data-filter="device"]',e).value;s&&i.set("channel",s),u&&i.set("device_id",u);try{let l=await c(`/api/v1/alerts?${i}`),m=L(d);p("[data-rows]",e).innerHTML=A(l.alerts,y.me?.farms||[],{technical:o,caveat:m,engineVerified:l.engine_verified!==!1,admin:$()}),p("[data-counts]",e).textContent=`${l.counts.open} activas \xB7 ${l.counts.closed} cerradas`+(l.engine_verified===!1?" \xB7 motor de avisos sin comprobar":""),o&&(p("[data-rules]",e).innerHTML=C((await c("/api/v1/alerts/rules")).rules||[],u||d[0]?.id,!0)),p("[data-delivery-note]",e).innerHTML=E()}catch(l){p("[data-alert-error]",e).textContent=`No se pudieron cargar los avisos: ${l.message}`}},r=async()=>{let i=p("[data-legacy-body]",e);if(i)try{let s=await c("/api/v1/alerts/legacy");if(!s.total){i.innerHTML='<p class="empty">No hay avisos heredados que revisar.</p>';return}let u=s.groups.flatMap(l=>l.alerts.map(m=>({alert:m,group:l})));i.innerHTML=`<p class="hint">${s.total} aviso(s) candidato(s) en ${s.groups.length} incidente(s).</p>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>Estaci\xF3n</th><th>Variable</th><th>Motivo</th><th>Aviso</th></tr></thead>
          <tbody>${u.map(({alert:l,group:m})=>`<tr>
            <td><input type="checkbox" data-legacy-id="${t(l.id)}" checked></td>
            <td>${t(m.deviceName||m.deviceId)}</td>
            <td>${t(h[m.metric]||m.metric||"\u2014")}</td>
            <td>${t(m.reason)}</td>
            <td>${t(l.message)} <span class="badge badge-muted">${b(l.createdAt)}</span></td>
          </tr>`).join("")}</tbody>
        </table></div>
        <button type="button" class="danger" data-action="close-legacy">Cerrar seleccionados</button>`}catch(s){i.innerHTML=`<p class="error">No se pudieron revisar los avisos heredados: ${t(s.message)}</p>`}};e.onclick=async i=>{let s=i.target.closest("button");if(s){if(s.dataset.action==="apply"){await a();return}if(s.dataset.action==="review-legacy"){await r();return}try{if(s.dataset.action==="close-legacy"){let u=[...e.querySelectorAll("[data-legacy-id]:checked")].map(m=>m.value);if(!u.length)return;let l=window.prompt("Motivo del cierre (opcional):","")||void 0;await c("/api/v1/alerts/legacy/close",{method:"POST",body:JSON.stringify(l?{ids:u,reason:l}:{ids:u})}),await r(),await a();return}if(s.dataset.toggleRule)await c(`/api/v1/alerts/rules/${s.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:s.dataset.next==="true"})});else if(s.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await c(`/api/v1/alerts/rules/${s.dataset.deleteRule}`,{method:"DELETE"})}else if(s.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await c(`/api/v1/alerts/${s.dataset.deleteAlert}`,{method:"DELETE"})}else{let u=s.dataset.ack||s.dataset.close||s.dataset.reopen;if(!u)return;if(s.dataset.ack&&await c(`/api/v1/alerts/${u}/acknowledge`,{method:"POST",body:JSON.stringify({})}),s.dataset.close){let l=window.prompt("Motivo del cierre (opcional):","")||void 0;await c(`/api/v1/alerts/${u}/close`,{method:"POST",body:JSON.stringify(l?{reason:l}:{})})}s.dataset.reopen&&await c(`/api/v1/alerts/${u}/reopen`,{method:"POST",body:JSON.stringify({})})}await a()}catch(u){p("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${u.message}`}}};let n=p("[data-rules]",e);n&&n.addEventListener("submit",async i=>{i.preventDefault();let s=new FormData(i.target),u=p('[data-filter="device"]',e).value||d[0]?.id;if(u)try{await c("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(O(s,u))}),await a()}catch(l){p("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${l.message}`}}),await a()}export{M as a,T as b,j as c,q as d};
