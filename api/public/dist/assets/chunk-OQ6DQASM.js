import{b as L}from"./chunk-ND5FSQDF.js";import{a as x,b as D,c as P,d as H}from"./chunk-IMFDBYEP.js";import{b as M,g as R}from"./chunk-O65OJFUJ.js";import{B as A,C as T,D as S,c as h,d as n,e as $,i as _,k as w,l as m,n as p,o as N,p as E}from"./chunk-HD5LCTF6.js";var F={pending:"pendiente",sent:"enviado",delivered:"entregado",failed:"fallido",bounced:"rebotado",manual:"manual"},j={frost:"Heladas",heat:"Calor",storm:"Tormentas",wind:"Viento",humidity:"Humedad",general:"General"};function C(){let e=m.support?.whatsappDelivery;return e?e==="manual"?`<p class="hint">${n(M)}</p>`:e==="disabled"?'<p class="hint">A\xFAn no hay entrega por WhatsApp configurada: los avisos quedan en la aplicaci\xF3n.</p>':'<p class="hint">Los avisos salen por los canales que hayas autorizado y verificado; puedes darte de baja cuando quieras.</p>':""}function W(e){if(e==null)return"sin fecha de medida";if(e<90)return`medida de hace ${e} s`;let t=Math.round(e/60);return t<90?`medida de hace ${t} min`:`medida de hace ${Math.round(t/60)} h`}function k(e){let t=Number(e)||0;return t===0?"inmediata":t<60?`${t} s`:t<3600?`${Math.round(t/60)} min`:`${Number((t/3600).toFixed(1))} h`}function G(e,t){let r=e.ruleSnapshot?.metric==="pressure",a=r&&typeof e.value=="number"?`${w(e.value)} milibares`:JSON.stringify(e.value),o=e.closedAt?`<span class="badge badge-muted">${e.autoResolved?"Recuperado":"Cerrado"} ${$(e.closedAt)}${e.closureReason?` \xB7 ${n(e.closureReason)}`:""}</span>`:'<span class="badge badge-warn">Abierto</span>',i=e.acknowledgedAt?`<span class="badge badge-valid">Reconocido ${$(e.acknowledgedAt)}</span>`:'<span class="badge badge-invalid">Sin reconocer</span>',v=e.ruleId?`<span class="source-tag">Regla ${n(A[e.ruleSnapshot?.metric]||e.ruleSnapshot?.metric||"")} ${n(T[e.ruleSnapshot?.comparator]||"")} ${r?`${w(e.ruleSnapshot?.threshold)} milibares`:n(e.ruleSnapshot?.threshold??"")}${e.ruleSnapshot?.min_duration_s?` \xB7 exige ${k(e.ruleSnapshot.min_duration_s)}`:""}${e.ruleSnapshot?.margin?` \xB7 margen ${r?`${w(e.ruleSnapshot.margin)} milibares`:n(String(e.ruleSnapshot.margin))}`:""}${e.ruleSnapshot?.urgent?" \xB7 urgente":""}</span>`:"",l=t?[!e.acknowledgedAt&&!e.closedAt?`<button type="button" data-ack="${n(e.id)}">Reconocer</button>`:"",e.closedAt?"":`<button type="button" class="quiet" data-close="${n(e.id)}">Cerrar</button>`,e.closedAt?`<button type="button" class="quiet" data-reopen="${n(e.id)}">Reabrir</button>`:"",E()?`<button type="button" class="danger" data-delete-alert="${n(e.id)}">Borrar</button>`:""].join(" "):"";return`<tr>
    <td>${e.level===1?"Prioritario":"Aviso"}</td>
    <td><strong>${n(e.message)}</strong>${v?`<br>${v}`:""}
      <div class="alert-detail">
        <span class="badge ${e.ageSeconds>1800?"badge-warn":"badge-muted"}">${W(e.ageSeconds)}</span>
        ${e.ingestDelaySeconds!=null?` \xB7 tard\xF3 ${k(e.ingestDelaySeconds)} en llegar`:""}
        \xB7 recibido ${$(e.createdAt)}
      </div></td>
    <td>${n(e.deviceName)}</td>
    <td>${n(a)}</td>
    <td>${n(e.source||"\u2014")}</td>
    <td>${n(e.recipient||"\u2014")}${e.channel?` \xB7 ${n(S[e.channel]||e.channel)}`:""}
      ${e.deliveryStatus?`<br><span class="badge badge-muted">${n(F[e.deliveryStatus]||e.deliveryStatus)}</span>`:""}</td>
    <td>${o}<br>${i}</td>
    <td class="row-actions">${l}</td>
  </tr>`}function z(e,t){let r=e.metric==="pressure",a=r?`${w(e.threshold)} milibares`:_(e.threshold),o=r?`${w(e.recoveryMargin)} milibares`:_(e.recoveryMargin),i=t&&!e.system?[`<button type="button" data-toggle-rule="${e.id}" data-next="${e.enabled?"false":"true"}">${e.enabled?"Desactivar":"Activar"}</button>`,`<button type="button" class="danger" data-delete-rule="${e.id}">Eliminar</button>`].join(" "):"",v=e.conditionActive?`<span class="badge badge-warn" title="Desde ${$(e.conditionSince)}">Condici\xF3n activa</span>`:'<span class="badge badge-muted">Inactiva</span>';return`<tr${e.system?' class="row-system"':""}>
    <td>${n(A[e.metric]||e.metric)}${e.system?' <span class="badge badge-muted">sistema</span>':""}${e.category&&e.category!=="general"?`<br><small>${n(j[e.category]||e.category)}</small>`:""}</td>
    <td>${n(T[e.comparator]||e.comparator)} ${a}</td>
    <td>${n(k(e.minDurationS))}</td>
    <td>${o}</td>
    <td>${e.urgent?'<span class="badge badge-invalid">urgente</span>':"\u2014"}</td>
    <td>${n(e.message)}</td>
    <td>${n(e.recipient||"\u2014")}<br><small>${n(S[e.channel]||e.channel)}</small></td>
    <td>${e.enabled?v:'<span class="badge badge-muted">Desactivada</span>'}</td>
    <td class="row-actions">${i}</td>
  </tr>`}async function K(e,t){let r=N(),a=await p(`/api/v1/alerts?device_id=${encodeURIComponent(t)}&status=all&limit=100`);if(!r){let i=a.not_subscribed?'<p class="hint">Est\xE1s viendo esta estaci\xF3n con acceso de consulta, pero no est\xE1s suscrito a sus avisos: los avisos solo llegan a quien tiene la estaci\xF3n concedida.</p>':"";e.innerHTML=`<section class="panel">
      <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Qu\xE9 se ha observado</h2></div></div>
      ${L(a.alerts,m.me?.farms||[],{technical:!1,engineVerified:a.engine_verified!==!1})}
      ${i}
      <p class="hint">Cada aviso indica su categor\xEDa, su fuente, su fecha, su estado y su vigencia, y si es un dato real,
        una previsi\xF3n, un c\xE1lculo o una simulaci\xF3n. Las reglas y los destinatarios no se muestran con acceso de consulta.</p>
      ${C()}
    </section>`;return}let o=await p(`/api/v1/alerts/rules?device_id=${encodeURIComponent(t)}`);e.innerHTML=`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">AVISOS DE LA ESTACI\xD3N</p><h2>Historial de avisos</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nivel</th><th>Aviso</th><th>Estaci\xF3n</th><th>Dato</th><th>Fuente</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${a.alerts.map(i=>G(i,r)).join("")||'<tr><td colspan="8">Sin avisos registrados.</td></tr>'}</tbody>
    </table></div>
    ${a.engine_verified===!1?'<p class="warn-box">El motor de avisos no est\xE1 comprobado en esta instalaci\xF3n: los avisos por superar un l\xEDmite no se presentan como tales.</p>':""}
    ${C()}
  </section>
  ${q(o.rules||[],t,r)}
  <p class="error" data-alert-error role="alert"></p>`,Q(e,t,()=>K(e,t))}function q(e,t,r){return`<section class="panel">
    <div class="section-heading"><div><p class="eyebrow">REGLAS</p><h2>L\xEDmites de aviso</h2></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>M\xE9trica</th><th>Condici\xF3n</th><th>Exige</th><th>Margen</th><th>Urgente</th><th>Mensaje</th><th>Destinatario</th><th>Estado</th><th></th></tr></thead>
      <tbody>${e.map(a=>z(a,r)).join("")||'<tr><td colspan="9">Sin reglas definidas.</td></tr>'}</tbody>
    </table></div>
    <p class="hint">Una regla solo avisa si la condici\xF3n se sostiene durante el tiempo indicado y no vuelve
      a la normalidad hasta pasar el margen: as\xED no se repite el mismo aviso por valores l\xEDmites.
      Las reglas de sistema (sin comunicaci\xF3n y bater\xEDa baja) los mantiene el servidor.</p>
    ${r?`<form data-rule-form class="rule-form">
      <label>M\xE9trica<select name="metric">${Object.entries(A).map(([a,o])=>`<option value="${a}">${o}</option>`).join("")}</select></label>
      <label>Condici\xF3n<select name="comparator">${Object.entries(T).map(([a,o])=>`<option value="${a}">${n(o)}</option>`).join("")}</select></label>
      <label data-threshold-label>L\xEDmite de la regla<input type="number" step="any" name="threshold" required></label>
      <label>Nivel<select name="level"><option value="2">Aviso</option><option value="1">Prioritario</option></select></label>
      <label>Categor\xEDa<select name="category">${Object.entries(j).map(([a,o])=>`<option value="${a}" ${a==="general"?"selected":""}>${n(o)}</option>`).join("")}</select></label>
      <label>Se sostiene (s)<input type="number" name="min_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label data-margin-label>Margen de recuperaci\xF3n<input type="number" name="recovery_margin" min="0" step="any" value="0"></label>
      <label>Recuperaci\xF3n a (valor)<input type="number" step="any" name="recovery_threshold" placeholder="opcional"></label>
      <label>Recuperaci\xF3n sostenida (s)<input type="number" name="recovery_duration_s" min="0" max="86400" step="60" value="0"></label>
      <label>No repetir (s)<input type="number" name="cooldown_s" min="0" max="604800" step="60" value="0"></label>
      <label>Mensaje<input name="message" required maxlength="200"></label>
      <label>Destinatario<input name="recipient" maxlength="200" placeholder="correo o tel\xE9fono"></label>
      <label>Canal<select name="channel">${J({me:m.me,whatsappDelivery:m.support?.whatsappDelivery}).map(({key:a,label:o})=>`<option value="${a}" ${a==="in_app"?"selected":""}>${n(o)}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="urgent"> Urgente: pedir env\xEDo inmediato</label>
      <button type="submit">Crear regla</button>
    </form>`:""}
  </section>`}function Q(e,t,r){e.onclick=async o=>{let i=o.target.closest("button");if(i)try{if(i.dataset.ack)await p(`/api/v1/alerts/${i.dataset.ack}/acknowledge`,{method:"POST",body:JSON.stringify({})});else if(i.dataset.close){let v=window.prompt("Motivo del cierre (opcional):","")||void 0;await p(`/api/v1/alerts/${i.dataset.close}/close`,{method:"POST",body:JSON.stringify(v?{reason:v}:{})})}else if(i.dataset.reopen)await p(`/api/v1/alerts/${i.dataset.reopen}/reopen`,{method:"POST",body:JSON.stringify({})});else if(i.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await p(`/api/v1/alerts/${i.dataset.deleteAlert}`,{method:"DELETE"})}else if(i.dataset.toggleRule)await p(`/api/v1/alerts/rules/${i.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:i.dataset.next==="true"})});else if(i.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await p(`/api/v1/alerts/rules/${i.dataset.deleteRule}`,{method:"DELETE"})}else return;await r()}catch(v){h("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${v.message}`}};let a=h("[data-rule-form]",e);if(a){let o=()=>{let i=a.elements.metric.value==="pressure";h("[data-threshold-label]",a).firstChild.textContent=i?"L\xEDmite (milibares)":"L\xEDmite de la regla",h("[data-margin-label]",a).firstChild.textContent=i?"Margen de recuperaci\xF3n (milibares)":"Margen de recuperaci\xF3n"};a.elements.metric.addEventListener("change",o),o(),a.addEventListener("submit",async i=>{i.preventDefault();let v=new FormData(a);try{await p("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(V(v,t))}),await r()}catch(l){h("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${l.message}`}})}}function V(e,t){let r=e.get("metric"),a=r==="pressure"?100:1,o={device_id:t,metric:r,comparator:e.get("comparator"),threshold:Number(e.get("threshold"))*a,level:Number(e.get("level")),message:e.get("message"),channel:e.get("channel"),category:e.get("category")||"general",min_duration_s:Number(e.get("min_duration_s")||0),recovery_margin:Number(e.get("recovery_margin")||0)*a,recovery_duration_s:Number(e.get("recovery_duration_s")||0),cooldown_s:Number(e.get("cooldown_s")||0),urgent:e.get("urgent")==="on"};return e.get("recovery_threshold")&&(o.recovery_threshold=Number(e.get("recovery_threshold"))*a),e.get("recipient")&&(o.recipient=e.get("recipient")),o}function B({me:e={},engineVerified:t=!0,whatsappDelivery:r=null,prefs:a=null,prefsKnown:o}={}){let i={email:e.channelAvailability?.email??!0,whatsapp:e.channelAvailability?.whatsapp??(r?r!=="disabled":!0)},v=H({me:e,prefs:a,service:i,prefsKnown:o}),l=(e.contacts||[]).filter(u=>u.channel==="email"||u.channel==="whatsapp"),s=[];if(v.stations?s.push({key:"station",label:"Estaci\xF3n o finca",state:"ok",detail:"La cuenta tiene estaci\xF3n o finca asociada."}):s.push({key:"station",label:"Estaci\xF3n o finca",state:"missing",detail:"Sin estaci\xF3n concedida ni finca no hay medici\xF3n propia que pueda disparar avisos.",action:{href:"#/",label:"Solicitar acceso al piloto"}}),v.categories.known?v.categories.selected?s.push({key:"categories",label:"Tipos de aviso",state:"ok",detail:"Has elegido al menos un tipo de aviso."}):s.push({key:"categories",label:"Tipos de aviso",state:"pending",detail:"Sin tipos de aviso elegidos no habr\xEDa ning\xFAn aviso que enviar.",action:{href:"#/cuenta",label:"Elegir tipos en Cuenta"}}):s.push({key:"categories",label:"Tipos de aviso",state:"pending",detail:"No pudimos comprobar tus tipos de aviso ahora mismo."}),!l.length)s.push({key:"channel",label:"Canal de contacto",state:"missing",detail:e.emailVerifiedAt?"No hay destinatario de avisos configurado. Puedes usar tu correo de acceso, ya confirmado, para los avisos.":"No hay destinatario de avisos configurado: ni correo ni WhatsApp.",action:{href:"#/cuenta",label:"Configurar canal en Cuenta"}});else for(let u of x){let g=v.channels[u];if(!g.configured)continue;let b=D[u];if(g.ready)s.push({key:`channel:${u}`,label:b,state:"ok",detail:`${b} verificado, autorizado y con el canal activo.`});else{let f=g.missing.map(O=>P[O]).join(", ");s.push({key:`channel:${u}`,label:b,state:"pending",detail:`${b} configurado, pero falta: ${f}.`,action:{href:"#/cuenta",label:"Completar en Cuenta"}})}}let c=[],d="ok";return t||(d="pending",c.push("el motor de avisos no est\xE1 comprobado en esta instalaci\xF3n")),r==="manual"?c.push("el WhatsApp se env\xEDa de forma manual durante el piloto"):r==="disabled"&&(d=d==="ok"?"pending":d,c.push("sin entrega por WhatsApp configurada")),s.push({key:"service",label:"Servicio de avisos",state:d,detail:c.length?`Con limitaciones: ${c.join("; ")}.`:"Motor de avisos comprobado y canales operativos."}),s}var Y={ok:"badge-valid",pending:"badge-warn",missing:"badge-invalid"},X={ok:"Listo",pending:"Pendiente",missing:"Falta"};function Z(e){return`<ul class="signup-steps">${e.map(t=>`<li>
    <span class="badge ${Y[t.state]||"badge-muted"}">${X[t.state]||t.state}</span>
    <strong>${n(t.label)}</strong>
    <span>${n(t.detail)}</span>
    ${t.action?`<a class="link" href="${t.action.href}">${n(t.action.label)}</a>`:""}
  </li>`).join("")}</ul>`}function ee({me:e,engineVerified:t,whatsappDelivery:r,prefs:a=null,prefsKnown:o}={}){let i=B({me:e,engineVerified:t,whatsappDelivery:r,prefs:a,prefsKnown:o}),l=i.every(s=>s.state==="ok")?"Tu alta de avisos est\xE1 completa. En el periodo consultado, ninguna condici\xF3n ha pasado de su l\xEDmite; si esperabas un aviso, revisa la calidad de los datos recibidos de arriba.":"Tu alta de avisos est\xE1 incompleta: aunque hubiera riesgo, con el alta a medias no te llegar\xEDa ning\xFAn aviso.";return`<section class="panel" data-signup>
    <div class="section-heading"><div><p class="eyebrow">ESTADO DE ALTA</p><h2>Por qu\xE9 puede que no haya avisos</h2></div></div>
    <p class="hint">${n(l)}</p>
    ${Z(i)}
    <p class="hint">Este bloque habla de tu configuraci\xF3n. Que no haya avisos tampoco significa que no haya riesgo:
      la calidad de los datos recibidos de arriba indica qu\xE9 fuentes est\xE1n activas y cu\xE1les no.</p>
  </section>`}function J({me:e={},whatsappDelivery:t=null}={}){let r=e.contacts||[],a=[{key:"in_app",label:S.in_app}];return a.push({key:"email",label:S.email}),(r.some(i=>i.channel==="whatsapp")||t&&t!=="disabled")&&a.push({key:"whatsapp",label:S.whatsapp}),a}var I=!1;async function oe(e){let t=N(),r=J({me:m.me,whatsappDelivery:m.support?.whatsappDelivery});e.innerHTML=`
    <div class="page-heading">
      <div><p class="eyebrow">AVISOS</p><h1>Centro de avisos</h1></div>
    </div>
    <section class="panel" data-service>
      <div class="section-heading"><div><p class="eyebrow">ESTADO DEL SERVICIO</p><h2>Servicio y canal</h2></div></div>
      <p class="hint">Tu cuenta recibe avisos en pantalla y por
        ${r.filter(({key:l})=>l!=="in_app").map(({label:l})=>l.toLowerCase()).join(" y ")}.
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
          <option value="">Todos</option>${r.map(({key:l,label:s})=>`<option value="${l}">${s}</option>`).join("")}</select></label>
        <label>Estaci\xF3n<select data-filter="device"><option value="">Todas</option></select></label>
        <button type="button" data-action="apply">Aplicar</button>
      </details>
    </section>
    <section class="panel${t?"":" hidden"}" data-rules></section>
    ${E()?`<section class="panel" data-legacy>
      <div class="section-heading"><div><p class="eyebrow">MANTENIMIENTO</p><h2>Avisos heredados</h2></div>
        <button type="button" class="quiet" data-action="review-legacy">Revisar</button></div>
      <p class="hint">Avisos abiertos cuya regla ya no est\xE1 activa, sin regla asociada, o duplicados de un
        mismo episodio. Se agrupan por incidente y se cierran sin borrar su rastro.</p>
      <div data-legacy-body></div>
    </section>`:""}`;let a=(await p("/api/v1/stations")).stations;h('[data-filter="device"]',e).innerHTML='<option value="">Todas</option>'+a.map(l=>`<option value="${n(l.id)}">${n(l.name)}</option>`).join("");let o=async()=>{h("[data-alert-error]",e).textContent="";let l=new URLSearchParams({status:"all",limit:"200"}),s=h('[data-filter="channel"]',e).value,c=h('[data-filter="device"]',e).value;s&&l.set("channel",s),c&&l.set("device_id",c);try{let d=await p(`/api/v1/alerts?${l}`),u=d.alerts.filter(y=>!y.closedAt),g=d.alerts.filter(y=>y.closedAt);if((u.length||g.length)&&!I){I=!0;try{await p("/api/v1/analytics/activation",{method:"POST",body:JSON.stringify({tool:"avisos"})})}catch{}}let b={technical:t,engineVerified:d.engine_verified!==!1,admin:E()};h("[data-active-rows]",e).innerHTML=L(u,m.me?.farms||[],{...b,caveat:R(a)}),h("[data-history-rows]",e).innerHTML=g.length?L(g,m.me?.farms||[],b):'<p class="empty">Todav\xEDa no hay avisos cerrados.</p>';let f=await p("/api/v1/alert-preferences").then(y=>({known:!0,prefs:y.preferences})).catch(()=>({known:!1,prefs:null})),U=B({me:m.me,engineVerified:d.engine_verified!==!1,whatsappDelivery:m.support?.whatsappDelivery,prefs:f.prefs,prefsKnown:f.known}).some(y=>y.state!=="ok");h("[data-signup]",e).innerHTML=u.length&&!U?"":ee({me:m.me,engineVerified:d.engine_verified!==!1,whatsappDelivery:m.support?.whatsappDelivery,prefs:f.prefs,prefsKnown:f.known}),h("[data-counts]",e).textContent=`${u.length} activas \xB7 ${g.length} cerradas`+(d.engine_verified===!1?" \xB7 motor de avisos sin comprobar":""),t&&(h("[data-rules]",e).innerHTML=q((await p("/api/v1/alerts/rules")).rules||[],c||a[0]?.id,!0)),h("[data-delivery-note]",e).innerHTML=C()}catch(d){h("[data-alert-error]",e).textContent=`No se pudieron cargar los avisos: ${d.message}`}},i=async()=>{let l=h("[data-legacy-body]",e);if(l)try{let s=await p("/api/v1/alerts/legacy");if(!s.total){l.innerHTML='<p class="empty">No hay avisos heredados que revisar.</p>';return}let c=s.groups.flatMap(d=>d.alerts.map(u=>({alert:u,group:d})));l.innerHTML=`<p class="hint">${s.total} aviso(s) candidato(s) en ${s.groups.length} incidente(s).</p>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>Estaci\xF3n</th><th>Variable</th><th>Motivo</th><th>Aviso</th></tr></thead>
          <tbody>${c.map(({alert:d,group:u})=>`<tr>
            <td><input type="checkbox" data-legacy-id="${n(d.id)}" checked></td>
            <td>${n(u.deviceName||u.deviceId)}</td>
            <td>${n(A[u.metric]||u.metric||"\u2014")}</td>
            <td>${n(u.reason)}</td>
            <td>${n(d.message)} <span class="badge badge-muted">${$(d.createdAt)}</span></td>
          </tr>`).join("")}</tbody>
        </table></div>
        <button type="button" class="danger" data-action="close-legacy">Cerrar seleccionados</button>`}catch(s){l.innerHTML=`<p class="error">No se pudieron revisar los avisos heredados: ${n(s.message)}</p>`}};e.onclick=async l=>{let s=l.target.closest("button");if(s){if(s.dataset.action==="apply"){await o();return}if(s.dataset.action==="review-legacy"){await i();return}try{if(s.dataset.action==="close-legacy"){let c=[...e.querySelectorAll("[data-legacy-id]:checked")].map(u=>u.value);if(!c.length)return;let d=window.prompt("Motivo del cierre (opcional):","")||void 0;await p("/api/v1/alerts/legacy/close",{method:"POST",body:JSON.stringify(d?{ids:c,reason:d}:{ids:c})}),await i(),await o();return}if(s.dataset.toggleRule)await p(`/api/v1/alerts/rules/${s.dataset.toggleRule}`,{method:"PATCH",body:JSON.stringify({enabled:s.dataset.next==="true"})});else if(s.dataset.deleteRule){if(!window.confirm("\xBFEliminar esta regla de aviso?"))return;await p(`/api/v1/alerts/rules/${s.dataset.deleteRule}`,{method:"DELETE"})}else if(s.dataset.deleteAlert){if(!window.confirm("\xBFBorrar este aviso definitivamente? Esta acci\xF3n no se puede deshacer."))return;await p(`/api/v1/alerts/${s.dataset.deleteAlert}`,{method:"DELETE"})}else{let c=s.dataset.ack||s.dataset.close||s.dataset.reopen;if(!c)return;if(s.dataset.ack&&await p(`/api/v1/alerts/${c}/acknowledge`,{method:"POST",body:JSON.stringify({})}),s.dataset.close){let d=window.prompt("Motivo del cierre (opcional):","")||void 0;await p(`/api/v1/alerts/${c}/close`,{method:"POST",body:JSON.stringify(d?{reason:d}:{})})}s.dataset.reopen&&await p(`/api/v1/alerts/${c}/reopen`,{method:"POST",body:JSON.stringify({})})}await o()}catch(c){h("[data-alert-error]",e).textContent=`No se pudo completar la acci\xF3n: ${c.message}`}}};let v=h("[data-rules]",e);v&&v.addEventListener("submit",async l=>{l.preventDefault();let s=new FormData(l.target),c=h('[data-filter="device"]',e).value||a[0]?.id;if(c)try{await p("/api/v1/alerts/rules",{method:"POST",body:JSON.stringify(V(s,c))}),await o()}catch(d){h("[data-alert-error]",e).textContent=`No se pudo crear la regla: ${d.message}`}}),await o()}export{W as a,k as b,K as c,B as d,Z as e,ee as f,J as g,oe as h};
