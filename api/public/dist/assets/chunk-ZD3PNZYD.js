import{b as T}from"./chunk-DM4LZVKH.js";import{b as O,g as x}from"./chunk-3GDF57X5.js";import{A as $,c as p,d as n,e as y,h as C,j as f,k as g,m as u,n as L,o as A,y as S,z as E}from"./chunk-UFTPYPBA.js";var H={pending:"pendiente",sent:"enviado",delivered:"entregado",failed:"fallido",bounced:"rebotado",manual:"manual"},M={frost:"Heladas",heat:"Calor",storm:"Tormentas",wind:"Viento",humidity:"Humedad",general:"General"};function _(){let e=g.support?.whatsappDelivery;return e?e==="manual"?`<p class="hint">${n(O)}</p>`:e==="disabled"?'<p class="hint">A\xFAn no hay entrega por WhatsApp configurada: los avisos quedan en la aplicaci\xF3n.</p>':'<p class="hint">Los avisos salen por los canales que hayas autorizado y verificado; puedes darte de baja cuando quieras.</p>':""}function I(e){if(e==null)return"sin fecha de medida";if(e<90)return`medida de hace ${e} s`;let t=Math.round(e/60);return t<90?`medida de hace ${t} min`:`medida de hace ${Math.round(t/60)} h`}function N(e){let t=Number(e)||0;return t===0?"inmediata":t<60?`${t} s`:t<3600?`${Math.round(t/60)} min`:`${Number((t/3600).toFixed(1))} h`}function V(e,t){let r=e.ruleSnapshot?.metric==="pressure",a=r&&typeof e.value=="number"?`${f(e.value)} mbar`:JSON.stringify(e.value),i=e.closedAt?`<span class="badge badge-muted">${e.autoResolved?"Recuperado":"Cerrado"} ${y(e.closedAt)}${e.closureReason?` \xB7 ${n(e.closureReason)}`:""}</span>`:'<span class="badge badge-warn">Abierto</span>',s=e.acknowledgedAt?`<span class="badge badge-valid">Reconocido ${y(e.acknowledgedAt)}</span>`:'<span class="badge badge-invalid">Sin reconocer</span>',v=e.ruleId?`<span class="source-tag">Regla ${n(S[e.ruleSnapshot?.metric]||e.ruleSnapshot?.metric||"")} ${n(E[e.ruleSnapshot?.comparator]||"")} ${r?`${f(e.ruleSnapshot?.threshold)} mbar`:n(e.ruleSnapshot?.threshold??"")}${e.ruleSnapshot?.min_duration_s?` \xB7 exige ${N(e.ruleSnapshot.min_duration_s)}`:""}${e.ruleSnapshot?.margin?` \xB7 margen ${r?`${f(e.ruleSnapshot.margin)} mbar`:n(String(e.ruleSnapshot.margin))}`:""}${e.ruleSnapshot?.urgent?" \xB7 urgente":""}</span>`:"",d=t?[!e.acknowledgedAt&&!e.closedAt?`<button type="button" data-ack="${n(e.id)}">Reconocer</button>`:"",e.closedAt?"":`<button type="button" class="quiet" data-close="${n(e.id)}">Cerrar</button>`,e.closedAt?`<button type="button" class="quiet" data-reopen="${n(e.id)}">Reabrir</button>`:"",A()?`<button type="button" class="danger" data-delete-alert="${n(e.id)}">Borrar</button>`:""].join(" "):"";return`<tr>
    <td>${e.level===1?"Prioritario":"Aviso"}</td>
    <td><strong>${n(e.message)}</strong>${v?`<br>${v}`:""}
      <div class="alert-detail">
        <span class="badge ${e.ageSeconds>1800?"badge-warn":"badge-muted"}">${I(e.ageSeconds)}</span>
        ${e.ingestDelaySeconds!=null?` \xB7 tard\xF3 ${N(e.ingestDelaySeconds)} en llegar`:""}
        \xB7 recibido ${y(e.createdAt)}
      </div></td>
    <td>${n(e.deviceName)}</td>
    <td>${n(a)}</td>
    <td>${n(e.source||"\u2014")}</td>
    <td>${n(e.recipient||"\u2014")}${e.channel?` \xB7 ${n($[e.channel]||e.channel)}`:""}
      ${e.deliveryStatus?`<br><span class="badge badge-muted">${n(H[e.deliveryStatus]||e.deliveryStatus)}</span>`:""}</td>
    <td>${i}<br>${s}</td>
    <td class="row-actions">${d}</td>
  </tr>`}function U(e,t){let r=e.metric==="pressure",a=r?`${f(e.threshold)} mbar`:C(e.threshold),i=r?`${f(e.recoveryMargin)} mbar`:C(e.recoveryMargin),s=t&&!e.system?[`<button type="button" data-toggle-rule="${e.id}" data-next="${e.enabled?"false":"true"}">${e.enabled?"Desactivar":"Activar"}</button>`,`<button type="button" class="danger" data-delete-rule="${e.id}">Eliminar</button>`].join(" "):"",v=e.conditionActive?`<span class="badge badge-warn" title="Desde ${y(e.conditionSince)}">Condici\xF3n activa</span>`:'<span class="badge badge-muted">Inactiva</span>';return`<tr${e.system?' class="row-system"':""}>
    <td>${n(S[e.metric]||e.metric)}${e.system?' <span class="badge badge-muted">sistema</span>':""}${e.category&&e.category!=="general"?`<br><small>${n(M[e.category]||e.category)}</small>`:""}</td>
    <td>${n(E[e.comparator]||e.comparator)} ${a}</td>
    <td>${n(N(e.minDurationS))}</td>
    <td>${i}</td>
    <td>${e.urgent?'<span class="badge badge-invalid">urgente</span>':"\u2014"}</td>
    <td>${n(e.message)}</td>
    <td>${n(e.recipient||"\u2014")}<br><small>${n($[e.channel]||e.channel)}</small></td>
    <td>${e.enabled?v:'<span class="badge badge-muted">Desactivada</span>'}</td>
    <td class="row-actions">${s}</td>
  </tr>`}async function z(e,t){let r=L(),a=await u(`/api/v1/alerts?device_id=${encodeURIComponent(t)}&status=all&limit=100`);if(!r){let s=a.not_subscribed?'<p class="hint">Est\xE1s viendo esta estaci\xF3n con acceso de consulta, pero no est\xE1s suscrito a sus avisos: los avisos solo llegan a quien tiene la estaci\xF3n concedida.</p>':"";e.innerHTML=`<section class="panel">
      <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Qu\xE9 se ha observado</h2></div></div>
      ${T(a.alerts,g.me?.farms||[],{technical:!1,engineVerified:a.engine_verified!==!1})}
      ${s}
      <p class="hint">Cada aviso indica su categor\xEDa, su fuente, su fecha, su estado y su vigencia, y si es un dato real,
        una previsi\xF3n, un c\xE1lculo o una simulaci\xF3n. Las reglas y los destinatarios no se muestran con acceso de consulta.</p>
      ${_()}
    </section>`;return}let i=await u(`/api/v1/alerts/rules?device_id=${encodeURIComponent(t)}`);e.innerHTML=`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Historial de avisos</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nivel</th><th>Aviso</th><th>Estaci\xF3n</th><th>Dato</th><th>Fuente</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${a.alerts.map(s=>V(s,r)).join("")||'<tr><td colspan="8">Sin avisos registrados.</td></tr>'}</tbody>
    </table></div>
    ${a.engine_verified===!1?'<p class="warn-box">El motor de avisos no est\xE1 comprobado en esta instalaci\xF3n: los avisos de umbral local no se presentan como tales.</p>':""}
    ${_()}
  </section>
  ${D(i.rules||[],t,r)}
  <p class="error" data-alert-error role="alert"></p>`,B(e,t,()=>z(e,t))}function D(e,t,r){return`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">REGLAS</p><h2>Umbrales de aviso</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>M\xE9trica</th><th>Condici\xF3n</th><th>Exige</th><th>Margen</th><th>Urgente</th><th>Mensaje</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${e.map(a=>U(a,r)).join("")||'<tr><td colspan="9">Sin reglas definidas.</td></tr>'}</tbody>
    </table></div>
    <p class="hint">Una regla solo avisa si la condici\xF3n se sostiene durante el tiempo indicado y no vuelve
      a la normalidad hasta pasar el margen: as\xED no se repite el mismo aviso por valores l\xEDmites.
      Las reglas de sistema (sin comunicaci\xF3n y bater\xEDa baja) los mantiene el servidor.</p>
    ${r?`<form data-rule-form class="rule-form">
      <label>M\xE9trica<select name="metric">${Object.entries(S).map(([a,i])=>`<option value="${a}">${i}</option>`).join("")}</select></label>
      <label>Condici\xF3n<select name="comparator">${Object.entries(E).map(([a,i])=>`<option value="${a}">${n(i)}</option>`).join("")}</select></label>
      <label data-threshold-label>Umbral<input type="number" step="any" name="threshold" required></label>
      <label>Nivel<select name="level"><option value="2">Aviso</option><option value="1">Prioritario</option></select></label>
      <label>Categor\xEDa<select name="category">${Object.entries(M).map(([a,i])=>`<option value="${a}" ${a==="general"?"selected":""}>${n(i)}</option>`).join("")}</select></label>
      <label>Se sostiene (s)<input type="number" name="min_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label data-margin-label>Margen de recuperaci\xF3n<input type="number" name="recovery_margin" min="0" step="any" value="0"></label>
      <label>Recuperaci\xF3n a (valor)<input type="number" step="any" name="recovery_threshold" placeholder="opcional"></label>
      <label>Recuperaci\xF3n sostenida (s)<input type="number" name="recovery_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label>No repetir (s)<input type="number" name="cooldown_s" min="0" max="604800" step="60" value="0"></label>
      <label>Mensaje<input name="message" required maxlength="200"></label>
      <label>Destinatario<input name="recipient" maxlength="200" placeholder="correo o tel\xE9fono"></label>
      <label>Canal<select name="channel">${j({me:g.me,whatsappDelivery:g.support?.whatsappDelivery}).map(({key:a,label:i})=>`<option value="${a}" ${a==="in_app"?"selected":""}>${n(i)}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="urgent"> Urgente: pedir env\xEDo inmediato</label>
      <button type="submit">Crear regla</button>
    </form>`:""}
  </section>`}function B(e,t,r){e.onclick=async i=>{let s=i.target.closest("button");if(s)try{if(s.dataset.ack)await u(`/api/v1/alerts/${s.dataset.ack}/acknowledge`,{method:"POST",body:JSON.stringify({})});else if(s.dataset.close){let v=window.prompt("Motivo del cierre (opcional):","")||void 0;await u(`/api/v1/alerts/${s.dataset.close}/close`,{method:"POST",body:JSON.stringify(v?{reason:v}:{})})}else if(s.dataset.reopen)await u(`/api/v1/alerts/${s.dataset.reopen}/reopen`,{method:"POST",body:JSON.stringify({})});else if(s.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await u(`/api/v1/alerts/${s.dataset.deleteAlert}`,{method:"DELETE"})}else if(s.dataset.toggleRule)await u(`/api/v1/alerts/rules/${s.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:s.dataset.next==="true"})});else if(s.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await u(`/api/v1/alerts/rules/${s.dataset.deleteRule}`,{method:"DELETE"})}else return;await r()}catch(v){p("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${v.message}`}};let a=p("[data-rule-form]",e);if(a){let i=()=>{let s=a.elements.metric.value==="pressure";p("[data-threshold-label]",a).firstChild.textContent=s?"Umbral (mbar)":"Umbral",p("[data-margin-label]",a).firstChild.textContent=s?"Margen de recuperaci\xF3n (mbar)":"Margen de recuperaci\xF3n"};a.elements.metric.addEventListener("change",i),i(),a.addEventListener("submit",async s=>{s.preventDefault();let v=new FormData(a);try{await u("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(R(v,t))}),await r()}catch(d){p("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${d.message}`}})}}function R(e,t){let r=e.get("metric"),a=r==="pressure"?100:1,i={device_id:t,metric:r,comparator:e.get("comparator"),threshold:Number(e.get("threshold"))*a,level:Number(e.get("level")),message:e.get("message"),channel:e.get("channel"),category:e.get("category")||"general",min_duration_s:Number(e.get("min_duration_s")||0),recovery_margin:Number(e.get("recovery_margin")||0)*a,recovery_duration_s:Number(e.get("recovery_duration_s")||0),cooldown_s:Number(e.get("cooldown_s")||0),urgent:e.get("urgent")==="on"};return e.get("recovery_threshold")&&(i.recovery_threshold=Number(e.get("recovery_threshold"))*a),e.get("recipient")&&(i.recipient=e.get("recipient")),i}function P({me:e={},engineVerified:t=!0,whatsappDelivery:r=null}={}){let i=(e.contacts||[]).filter(m=>m.channel==="email"||m.channel==="whatsapp"),s=i.length>0,v=i.some(m=>m.optedIn),d=i.some(m=>m.verified),o=i.filter(m=>!m.verified||!m.optedIn),l=[];e.stations?.length?l.push({key:"station",label:"Estaci\xF3n",state:"ok",detail:`${e.stations.length} estaci\xF3n(es) concedida(s): ${e.stations.map(m=>m.name).join(", ")}.`}):l.push({key:"station",label:"Estaci\xF3n",state:"missing",detail:"Sin estaci\xF3n concedida no hay medici\xF3n propia que pueda disparar avisos.",action:{href:"#/",label:"Solicitar acceso al piloto"}});let c=i.map(m=>m.channel==="email"?"Correo":"WhatsApp").join(" y ");if(!s)l.push({key:"channel",label:"Canal de contacto",state:"missing",detail:"No hay destinatario de avisos configurado: ni correo ni WhatsApp.",action:{href:"#/cuenta",label:"Configurar canal en Cuenta"}});else if(o.length){let m=o.map(k=>k.channel==="email"?"Correo":"WhatsApp").join(" y ");l.push({key:"channel",label:"Canal de contacto",state:"pending",detail:`${c} configurado(s), pero falta completar ${m}: verificaci\xF3n y autorizaci\xF3n.`,action:{href:"#/cuenta",label:"Completar en Cuenta"}})}else l.push({key:"channel",label:"Canal de contacto",state:"ok",detail:`${c} verificado(s) y autorizado(s).`});l.push(v?{key:"optin",label:"Autorizaci\xF3n",state:"ok",detail:"Hay destinatario autorizado a recibir avisos."}:{key:"optin",label:"Autorizaci\xF3n",state:s?"pending":"missing",detail:s?"Ning\xFAn canal est\xE1 autorizado a recibir avisos: sin autorizaci\xF3n no se env\xEDa nada.":"Sin canal configurado no hay autorizaci\xF3n que revisar.",action:s?{href:"#/cuenta",label:"Autorizar en Cuenta"}:null}),l.push(d?{key:"verify",label:"Verificaci\xF3n",state:"ok",detail:"Destinatario de avisos verificado con c\xF3digo."}:{key:"verify",label:"Verificaci\xF3n",state:s?"pending":"missing",detail:s?"Ning\xFAn destinatario verificado: los avisos solo salen a direcciones confirmadas con c\xF3digo.":"Sin canal configurado no hay verificaci\xF3n pendiente.",action:s?{href:"#/cuenta",label:"Verificar en Cuenta"}:null});let h=[],b="ok";return t||(b="pending",h.push("el motor de avisos no est\xE1 comprobado en esta instalaci\xF3n")),r==="manual"?h.push("el WhatsApp se env\xEDa de forma manual durante el piloto"):r==="disabled"&&(b=b==="ok"?"pending":b,h.push("sin entrega por WhatsApp configurada")),l.push({key:"service",label:"Servicio de avisos",state:b,detail:h.length?`Con limitaciones: ${h.join("; ")}.`:"Motor de avisos comprobado y canales operativos."}),l}var J={ok:"badge-valid",pending:"badge-warn",missing:"badge-invalid"},W={ok:"Listo",pending:"Pendiente",missing:"Falta"};function F(e){return`<ul class="signup-steps">${e.map(t=>`<li>
    <span class="badge ${J[t.state]||"badge-muted"}">${W[t.state]||t.state}</span>
    <strong>${n(t.label)}</strong>
    <span>${n(t.detail)}</span>
    ${t.action?`<a class="link" href="${t.action.href}">${n(t.action.label)}</a>`:""}
  </li>`).join("")}</ul>`}function G({me:e,engineVerified:t,whatsappDelivery:r}){let a=P({me:e,engineVerified:t,whatsappDelivery:r}),s=a.every(v=>v.state==="ok")?"Tu alta de avisos est\xE1 completa. En el periodo consultado, ninguna condici\xF3n ha superado los umbrales; si esperabas un aviso, revisa la cobertura de datos de arriba.":"Tu alta de avisos est\xE1 incompleta: aunque hubiera riesgo, con el alta a medias no te llegar\xEDa ning\xFAn aviso.";return`<section class="panel" data-signup>
    <div class="section-heading"><div><p class="eyebrow">ESTADO DE ALTA</p><h2>Por qu\xE9 puede que no haya avisos</h2></div></div>
    <p class="hint">${n(s)}</p>
    ${F(a)}
    <p class="hint">Este bloque habla de tu configuraci\xF3n. Que no haya avisos tampoco significa que no haya riesgo:
      la cobertura de datos de arriba indica qu\xE9 fuentes est\xE1n activas y cu\xE1les no.</p>
  </section>`}function j({me:e={},whatsappDelivery:t=null}={}){let r=e.contacts||[],a=[{key:"in_app",label:$.in_app}];return a.push({key:"email",label:$.email}),(r.some(s=>s.channel==="whatsapp")||t&&t!=="disabled")&&a.push({key:"whatsapp",label:$.whatsapp}),a}async function Z(e){let t=L(),r=j({me:g.me,whatsappDelivery:g.support?.whatsappDelivery});e.innerHTML=`
    <div class="page-heading">
      <div><p class="eyebrow">AVISOS</p><h1>Centro de avisos</h1></div>
    </div>
    <section class="panel" data-service>
      <div class="section-heading"><div><p class="eyebrow">ESTADO DEL SERVICIO</p><h2>Servicio y canal</h2></div></div>
      <p class="hint">Tu cuenta recibe avisos en pantalla y por
        ${r.filter(({key:d})=>d!=="in_app").map(({label:d})=>d.toLowerCase()).join(" y ")}.
        El WhatsApp se env\xEDa de forma manual durante el piloto. SMS, Webhook y Push no est\xE1n disponibles en esta instalaci\xF3n.</p>
      <p class="coverage" data-counts></p>
      <p class="error" data-alert-error role="alert"></p>
      <p data-delivery-note></p>
    </section>
    <section class="panel" data-active>
      <div class="section-heading"><div><p class="eyebrow">AVISOS ACTIVOS</p><h2>Lo que requiere tu atenci\xF3n</h2></div></div>
      <div data-active-rows></div>
      <div data-signup></div>
    </section>
    <section class="panel" data-history>
      <div class="section-heading"><div><p class="eyebrow">HISTORIAL</p><h2>Avisos cerrados</h2></div></div>
      <div data-history-rows></div>
    </section>
    <section class="panel" data-filters>
      <details class="filters-advanced">
        <summary>Filtros avanzados</summary>
        <label>Canal<select data-filter="channel">
          <option value="">Todos</option>${r.map(({key:d,label:o})=>`<option value="${d}">${o}</option>`).join("")}</select></label>
        <label>Estaci\xF3n<select data-filter="device"><option value="">Todas</option></select></label>
        <button type="button" data-action="apply">Aplicar</button>
      </details>
    </section>
    <section class="panel${t?"":" hidden"}" data-rules></section>
    ${A()?`<section class="panel" data-legacy>
      <div class="section-heading"><div><p class="eyebrow">MANTENIMIENTO</p><h2>Avisos heredados</h2></div>
        <button type="button" class="quiet" data-action="review-legacy">Revisar</button></div>
      <p class="hint">Avisos abiertos cuya regla ya no est\xE1 activa, sin regla asociada, o duplicados de un
        mismo episodio. Se agrupan por incidente y se cierran sin borrar su rastro.</p>
      <div data-legacy-body></div>
    </section>`:""}`;let a=(await u("/api/v1/stations")).stations;p('[data-filter="device"]',e).innerHTML='<option value="">Todas</option>'+a.map(d=>`<option value="${n(d.id)}">${n(d.name)}</option>`).join("");let i=async()=>{p("[data-alert-error]",e).textContent="";let d=new URLSearchParams({status:"all",limit:"200"}),o=p('[data-filter="channel"]',e).value,l=p('[data-filter="device"]',e).value;o&&d.set("channel",o),l&&d.set("device_id",l);try{let c=await u(`/api/v1/alerts?${d}`),h=c.alerts.filter(w=>!w.closedAt),b=c.alerts.filter(w=>w.closedAt),m={technical:t,engineVerified:c.engine_verified!==!1,admin:A()};p("[data-active-rows]",e).innerHTML=T(h,g.me?.farms||[],{...m,caveat:x(a)}),p("[data-history-rows]",e).innerHTML=b.length?T(b,g.me?.farms||[],m):'<p class="empty">Todav\xEDa no hay avisos cerrados.</p>';let q=P({me:g.me,engineVerified:c.engine_verified!==!1,whatsappDelivery:g.support?.whatsappDelivery}).some(w=>w.state!=="ok");p("[data-signup]",e).innerHTML=h.length&&!q?"":G({me:g.me,engineVerified:c.engine_verified!==!1,whatsappDelivery:g.support?.whatsappDelivery}),p("[data-counts]",e).textContent=`${h.length} activas \xB7 ${b.length} cerradas`+(c.engine_verified===!1?" \xB7 motor de avisos sin comprobar":""),t&&(p("[data-rules]",e).innerHTML=D((await u("/api/v1/alerts/rules")).rules||[],l||a[0]?.id,!0)),p("[data-delivery-note]",e).innerHTML=_()}catch(c){p("[data-alert-error]",e).textContent=`No se pudieron cargar los avisos: ${c.message}`}},s=async()=>{let d=p("[data-legacy-body]",e);if(d)try{let o=await u("/api/v1/alerts/legacy");if(!o.total){d.innerHTML='<p class="empty">No hay avisos heredados que revisar.</p>';return}let l=o.groups.flatMap(c=>c.alerts.map(h=>({alert:h,group:c})));d.innerHTML=`<p class="hint">${o.total} aviso(s) candidato(s) en ${o.groups.length} incidente(s).</p>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>Estaci\xF3n</th><th>Variable</th><th>Motivo</th><th>Aviso</th></tr></thead>
          <tbody>${l.map(({alert:c,group:h})=>`<tr>
            <td><input type="checkbox" data-legacy-id="${n(c.id)}" checked></td>
            <td>${n(h.deviceName||h.deviceId)}</td>
            <td>${n(S[h.metric]||h.metric||"\u2014")}</td>
            <td>${n(h.reason)}</td>
            <td>${n(c.message)} <span class="badge badge-muted">${y(c.createdAt)}</span></td>
          </tr>`).join("")}</tbody>
        </table></div>
        <button type="button" class="danger" data-action="close-legacy">Cerrar seleccionados</button>`}catch(o){d.innerHTML=`<p class="error">No se pudieron revisar los avisos heredados: ${n(o.message)}</p>`}};e.onclick=async d=>{let o=d.target.closest("button");if(o){if(o.dataset.action==="apply"){await i();return}if(o.dataset.action==="review-legacy"){await s();return}try{if(o.dataset.action==="close-legacy"){let l=[...e.querySelectorAll("[data-legacy-id]:checked")].map(h=>h.value);if(!l.length)return;let c=window.prompt("Motivo del cierre (opcional):","")||void 0;await u("/api/v1/alerts/legacy/close",{method:"POST",body:JSON.stringify(c?{ids:l,reason:c}:{ids:l})}),await s(),await i();return}if(o.dataset.toggleRule)await u(`/api/v1/alerts/rules/${o.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:o.dataset.next==="true"})});else if(o.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await u(`/api/v1/alerts/rules/${o.dataset.deleteRule}`,{method:"DELETE"})}else if(o.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await u(`/api/v1/alerts/${o.dataset.deleteAlert}`,{method:"DELETE"})}else{let l=o.dataset.ack||o.dataset.close||o.dataset.reopen;if(!l)return;if(o.dataset.ack&&await u(`/api/v1/alerts/${l}/acknowledge`,{method:"POST",body:JSON.stringify({})}),o.dataset.close){let c=window.prompt("Motivo del cierre (opcional):","")||void 0;await u(`/api/v1/alerts/${l}/close`,{method:"POST",body:JSON.stringify(c?{reason:c}:{})})}o.dataset.reopen&&await u(`/api/v1/alerts/${l}/reopen`,{method:"POST",body:JSON.stringify({})})}await i()}catch(l){p("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${l.message}`}}};let v=p("[data-rules]",e);v&&v.addEventListener("submit",async d=>{d.preventDefault();let o=new FormData(d.target),l=p('[data-filter="device"]',e).value||a[0]?.id;if(l)try{await u("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(R(o,l))}),await i()}catch(c){p("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${c.message}`}}),await i()}export{I as a,N as b,z as c,P as d,F as e,G as f,j as g,Z as h};
