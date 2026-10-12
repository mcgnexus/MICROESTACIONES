import{a as w,c as x}from"./chunk-FDCKGUGI.js";import{a as T,b as A}from"./chunk-6OCCGOZS.js";import{a as D,b as O,c as F,d as R}from"./chunk-IMFDBYEP.js";import{b as I}from"./chunk-3GDF57X5.js";import{c as u,d as l,e as N,l as k,n as m,x as q,y as P}from"./chunk-IDTT5QG6.js";var U={sin_codigo:"Todav\xEDa no has pedido ning\xFAn c\xF3digo.",queued:"Estamos preparando tu c\xF3digo.",manual:"Tu c\xF3digo queda pendiente de env\xEDo manual durante el piloto.",sent:"C\xF3digo enviado. Introd\xFAcelo para verificar.",delivered:"C\xF3digo entregado. Introd\xFAcelo para verificar.",failed:"No se pudo enviar el c\xF3digo. Puedes reintentarlo.",expired:"El c\xF3digo ha caducado. Pide uno nuevo.",verified:"Destinatario verificado."},j=["delivered","failed","expired","verified"],B=3e3,H=12e4,y=new Map;function V(){for(let a of y.values())clearTimeout(a);y.clear()}var S=[{key:"whatsapp",label:"WhatsApp",placeholder:"600 000 000",addressLabel:"Tel\xE9fono de WhatsApp",inputType:"tel",autocomplete:"tel",inputmode:"tel"},{key:"email",label:"Correo",placeholder:"tu@correo.es",addressLabel:"Correo electr\xF3nico",inputType:"email",autocomplete:"email",inputmode:"email"}];function z(){return`<select name="country">${x().map(a=>`<option value="${a.code}"${a.code===w?" selected":""}>${a.name} (+${a.callingCode})</option>`).join("")}</select>`}function M(a,i,d){let v=!!i?.optedIn,c=!!i?.verified,g=i?`${c?"verificado":"sin verificar"} \xB7 ${v?"recibe avisos":"no recibe avisos"}`:"sin configurar",r=!!i&&!c&&!!d;return`<div class="contact-block">
    <div class="section-heading"><div><h3>${a.label}</h3><p class="hint">${l(g)}</p></div></div>
    <form data-contact-form="${a.key}" class="rule-form">
      ${a.key==="whatsapp"?`<label>Pa\xEDs del tel\xE9fono${z()}</label>`:""}
      <label>${a.addressLabel}<input name="address" type="${a.inputType}" inputmode="${a.inputmode}" autocomplete="${a.autocomplete}" value="${l(i?.address||"")}" placeholder="${a.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${v?"checked":""}> Autorizar avisos por ${a.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${r?`<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${a.key}">Enviar c\xF3digo de verificaci\xF3n</button>
      <button type="button" class="quiet hidden" data-resend="${a.key}">Reenviar c\xF3digo</button>
      <form data-confirm-form="${a.key}" class="rule-form hidden">
        <label>C\xF3digo recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar c\xF3digo</button>
      </form>
      <p class="hint" data-verify-hint="${a.key}"></p>
      <p class="hint" data-verify-state="${a.key}"></p>
    </div>`:""}
    ${i&&!c&&!d?`<p class="hint">La verificaci\xF3n por ${a.label} no est\xE1 disponible ahora mismo. Puedes guardar el contacto y verificarlo cuando el canal vuelva.</p>`:""}
  </div>`}function G(a,i){let d=i.email;return!a.emailVerifiedAt||d&&d.verified?"":`<div class="contact-verify">
    <p class="hint">Tu correo de acceso ya est\xE1 confirmado. Puedes usarlo para los avisos sin volver a verificarlo.</p>
    <button type="button" data-reuse-email>Usar este correo para los avisos</button>
  </div>`}function W(a,i){let d=R({me:{...a,contacts:a.contacts||[]},prefs:i,service:a.channelAvailability||{}}),v=(s,p=!1)=>s?"ok":p?"pending":"missing",c=[];for(let s of D){let p=d.channels[s],$=O[s];c.push({label:$,state:v(p.ready,p.configured),detail:p.ready?`Destinatario de ${$.toLowerCase()} verificado, autorizado y con el canal activo.`:p.configured?`Falta: ${p.missing.map(_=>F[_]).join(", ")}.`:`A\xF1ade ${$.toLowerCase()} y verif\xEDcalo para recibir avisos por este canal.`})}c.push({label:"Tipos de aviso",state:v(d.categories.selected,!0),detail:d.categories.selected?"Has elegido qu\xE9 avisos quieres recibir.":"Selecciona al menos un tipo de aviso abajo."}),c.push({label:"Estaci\xF3n o finca",state:v(d.stations),detail:d.stations?"Tu cuenta tiene estaci\xF3n o finca asociada.":"Crea una finca y as\xF3ciale tu estaci\xF3n."});let g={ok:"badge-valid",pending:"badge-warn",missing:"badge-invalid"},r={ok:"Listo",pending:"Pendiente",missing:"Falta"};return`<ol class="signup-steps avisos-steps">${c.map(s=>`<li><span class="badge ${g[s.state]}">${r[s.state]}</span><strong>${l(s.label)}</strong><span>${l(s.detail)}</span></li>`).join("")}</ol>`}function J(a,i){let d=a.devices||[],v=i.filter(c=>!d.includes(c.id)).map(c=>`<option value="${l(c.id)}">${l(c.name)}</option>`).join("");return`<div class="farm-block">
    <div class="section-heading">
      <div><h3>${l(a.name)}</h3><p class="hint">${l([a.municipality,a.crop,a.livestock].filter(Boolean).join(" \xB7 ")||"sin detalle")}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${l(a.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${d.length?d.map(c=>{let g=i.find(r=>r.id===c)?.name||c;return`<span class="chip">${l(g)}<button type="button" class="chip-remove" data-farm-unlink="${l(a.id)}" data-device="${l(c)}" aria-label="Quitar ${l(g)}">\xD7</button></span>`}).join(""):'<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${v?`<form data-farm-link="${l(a.id)}" class="rule-form">
      <label>Asociar estaci\xF3n<select name="device_id">${v}</select></label>
      <button type="submit">Asociar</button>
    </form>`:""}
  </div>`}var Y={receiveFrost:!0,receiveHeat:!0,receiveStorm:!0,receiveWind:!0,receiveHumidity:!0,receiveGeneral:!0,channelWhatsapp:!0,channelEmail:!0,quietStart:null,quietEnd:null,zone:null,crop:null,customThresholds:{}};async function L(a){V();let i=k.me,d=i.contacts||[],v=Object.fromEntries(d.map(e=>[e.channel,e])),c=i.farms||[],g=i.channelAvailability||{},r=await m("/api/v1/alert-preferences").then(e=>e.preferences).catch(()=>null)||Y;a.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${l(i.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CONFIGURACI\xD3N DE AVISOS</p><h2>Asistente de avisos</h2></div></div>
      <p class="hint">El estado se calcula por canal y destinatario: cada canal solo queda listo si, sobre el mismo contacto, est\xE1 verificado y autorizado, el canal sigue activo en preferencias, hay alg\xFAn tipo de aviso elegido, la cuenta tiene estaci\xF3n o finca y el servicio de ese canal est\xE1 disponible.</p>
      ${W(i,r)}
      <div class="section-heading"><div><h3>Contacto, autorizaci\xF3n y verificaci\xF3n</h3></div></div>
      <p class="hint">A\xF1ade tu WhatsApp o correo, autoriza el env\xEDo y verifica la direcci\xF3n. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${k.support?.whatsappDelivery==="manual"?`<p class="hint">${l(I)}</p>`:""}
      ${S.map(e=>M(e,v[e.key],g[e.key])).join("")}
      ${G(i,v)}
      <div class="section-heading"><div><h3>Preferencias efectivas</h3></div></div>
      <p class="hint">No todos necesitan lo mismo: un almendro teme la helada y el ganado el calor. Elige aqu\xED tus avisos.</p>
      <form data-prefs-form class="rule-form">
        <fieldset class="prefs-group span-all"><legend>Tipos de aviso</legend>
          <label class="check"><input type="checkbox" name="receive_frost" ${r.receiveFrost?"checked":""}> Heladas</label>
          <label class="check"><input type="checkbox" name="receive_heat" ${r.receiveHeat?"checked":""}> Golpes de calor</label>
          <label class="check"><input type="checkbox" name="receive_storm" ${r.receiveStorm?"checked":""}> Tormentas</label>
          <label class="check"><input type="checkbox" name="receive_wind" ${r.receiveWind?"checked":""}> Viento</label>
          <label class="check"><input type="checkbox" name="receive_humidity" ${r.receiveHumidity?"checked":""}> Humedad</label>
          <label class="check"><input type="checkbox" name="receive_general" ${r.receiveGeneral?"checked":""}> Informaci\xF3n general</label>
        </fieldset>
        <fieldset class="prefs-group span-all"><legend>Canales</legend>
          <label class="check"><input type="checkbox" name="channel_whatsapp" ${r.channelWhatsapp?"checked":""}> WhatsApp</label>
          <label class="check"><input type="checkbox" name="channel_email" ${r.channelEmail?"checked":""}> Correo</label>
        </fieldset>
        <label>Silencio desde<input type="time" name="quiet_start" value="${l((r.quietStart||"").slice(0,5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${l((r.quietEnd||"").slice(0,5))}"></label>
        <label>Zona<input name="zone" maxlength="160" value="${l(r.zone||"")}"></label>
        <label>Cultivo o ganado<input name="crop" maxlength="160" value="${l(r.crop||"")}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias.</p>
        <button type="submit" class="span-all">Guardar preferencias</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MIS FINCAS</p><h2>Fincas y estaciones</h2></div></div>
      <p class="hint">Agrupa tus estaciones por finca para reconocer cada aviso por su nombre.</p>
      <div class="farm-list">${c.map(e=>J(e,i.stations)).join("")||'<p class="empty">Todav\xEDa no has creado ninguna finca.</p>'}</div>
      <form data-farm-form class="rule-form">
        <label>Nombre de la finca<input name="name" required minlength="2" maxlength="120"></label>
        <label>Municipio<input name="municipality" maxlength="120"></label>
        <label>Cultivo<input name="crop" maxlength="120"></label>
        <label>Ganado<input name="livestock" maxlength="120"></label>
        <button type="submit">A\xF1adir finca</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PERFIL OPCIONAL</p><h2>Para afinar tus avisos</h2></div></div>
      <p class="hint">Rellenarlo es opcional: nos ayuda a ajustar los avisos a tu actividad y zona.</p>
      <form data-profile-form class="rule-form">
        <label>Municipio<input name="municipality" maxlength="120" value="${l(i.profile?.municipality||"")}"></label>
        <label>Actividad
          <select name="activity">
            <option value="">Selecciona\u2026</option>
            <option value="agricultura" ${i.profile?.activity==="agricultura"?"selected":""}>Agricultura</option>
            <option value="ganaderia" ${i.profile?.activity==="ganaderia"?"selected":""}>Ganader\xEDa</option>
            <option value="mixta" ${i.profile?.activity==="mixta"?"selected":""}>Agricultura y ganader\xEDa</option>
            <option value="otra" ${i.profile?.activity==="otra"?"selected":""}>Otra</option>
          </select>
        </label>
        <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${l(i.profile?.cropOrLivestock||"")}"></label>
        <label>Inter\xE9s principal
          <select name="interest">
            <option value="">Selecciona\u2026</option>
            <option value="heladas" ${i.profile?.interest==="heladas"?"selected":""}>Heladas</option>
            <option value="calor" ${i.profile?.interest==="calor"?"selected":""}>Golpes de calor</option>
            <option value="tormentas" ${i.profile?.interest==="tormentas"?"selected":""}>Tormentas</option>
            <option value="viento" ${i.profile?.interest==="viento"?"selected":""}>Viento</option>
            <option value="humedad" ${i.profile?.interest==="humedad"?"selected":""}>Humedad</option>
            <option value="general" ${i.profile?.interest==="general"?"selected":""}>Informaci\xF3n general</option>
            <option value="futura_instalacion" ${i.profile?.interest==="futura_instalacion"?"selected":""}>Futura instalaci\xF3n</option>
          </select>
        </label>
        <button type="submit">Guardar perfil</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCI\xD3N</p><h2>Tu cuenta</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${l(q(i.role))}</dd>
        <dt>Plan</dt><dd>${l(P(i.plan))}</dd>
        <dt>Estaciones</dt><dd>${i.stations.map(e=>l(e.name)).join(", ")||"sin estaciones vinculadas"}</dd>
        <dt>Correo de acceso verificado</dt><dd>${i.emailVerifiedAt?`<span class="badge badge-valid">verificado ${N(i.emailVerifiedAt)}</span>`:'<span class="badge badge-warn">pendiente</span>'}</dd>
      </dl>
      <p class="hint">Esta verificaci\xF3n es la del correo con el que entras: confirma tu acceso. Es distinta de la verificaci\xF3n por c\xF3digo de un destinatario de avisos, que se hace arriba, en cada canal.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">REFERENCIA PARA EL EQUIPO</p><h2>Umbrales que te servir\xEDan</h2></div></div>
      <p class="hint"><strong>Preferencia para valorar con el equipo. Todav\xEDa no modifica tus avisos.</strong> Estos valores no cambian los avisos que recibes: los umbrales que disparan las alertas los fija el equipo por estaci\xF3n y no se editan desde aqu\xED.</p>
      <p class="hint">D\xE9janos los que t\xFA usar\xEDas: los revisamos contigo al ajustar el piloto. Rellenarlo es opcional.</p>
      <form data-thresholds-form class="rule-form">
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa la helada (\xB0C)<input type="number" step="0.5" placeholder="${T}" name="frost_c" value="${r.customThresholds?.frost_c??""}"></label>
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa el calor (\xB0C)<input type="number" step="0.5" placeholder="${A}" name="heat_c" value="${r.customThresholds?.heat_c??""}"></label>
        <p class="hint span-all">En blanco = se queda el actual del equipo (${T} \xB0C helada, ${A} \xB0C calor).</p>
        <button type="submit" class="span-all">Enviar para el equipo</button>
      </form>
      <p class="hint" data-thresholds-ok role="status"></p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PILOTO</p><h2>\xBFQuieres alertas en otra finca?</h2></div></div>
      <p class="hint">Las solicitudes de piloto se gestionan desde la web p\xFAblica. Si conoces a alguien interesado, puedes compartir la direcci\xF3n de la portada.</p>
      <p class="hint"><a class="link" href="#/">Ir a la p\xE1gina p\xFAblica</a></p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PUBLICIDAD</p><h2>Novedades y ofertas (opcional)</h2></div></div>
      <p class="hint">Usar la demo no depende de esto. Marca solo los canales por los que quieras recibir novedades y ofertas sobre microestaciones. Puedes retirarlos cuando quieras.</p>
      <div class="consent-grid">
        ${S.map(e=>{let t=!!i.consents?.commercial?.[e.key]?.granted,o=e.key==="email"||!!v.whatsapp;return`<label class="check"><input type="checkbox" data-commercial="${e.key}"
            ${t?"checked":""} ${o?"":"disabled"}> ${e.label}${o?"":" (a\xF1ade el canal en Canales de aviso)"}</label>`}).join("")}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${l(i.consentTextVersion||"")}</strong>. Al revocar, se cancelan los env\xEDos comerciales pendientes.</p>
    </section>`;let s=e=>{u("[data-error]",a).textContent=e},p=async()=>{k.me=await m("/api/v1/me"),await L(a)},$=e=>{let t=Date.now(),o=async()=>{let n=null;try{n=await m(`/api/v1/contacts/${e}/verification`)}catch{n=null}if(n){let f=u(`[data-verify-state="${e}"]`,a);f&&(f.textContent=U[n.state]||"");let h=u(`[data-resend="${e}"]`,a);if(h){let b=n.resendAt?new Date(n.resendAt).getTime()-Date.now():0;h.classList.remove("hidden"),h.disabled=b>0,h.textContent=b>0?`Reenviar en ${Math.ceil(b/1e3)} s`:"Reenviar c\xF3digo"}if(n.state==="verified"){y.delete(e),await p();return}if(j.includes(n.state)){y.delete(e);return}}if(Date.now()-t>H){y.delete(e);return}y.set(e,setTimeout(o,B))};o()},_=async e=>{s("");try{let t=await m(`/api/v1/contacts/${e}/verify`,{method:"POST"}),o=u(`[data-confirm-form="${e}"]`,a);o&&o.classList.remove("hidden");let n=u(`[data-verify-hint="${e}"]`,a);n&&(n.textContent=t.devCode?`C\xF3digo de prueba: ${t.devCode}`:"Estamos preparando tu c\xF3digo."),$(e)}catch(t){t.message==="channel_unavailable"?s("Este canal no est\xE1 disponible ahora mismo. Int\xE9ntalo m\xE1s tarde."):t.message==="cooldown"||t.message==="rate_limited"?s("Espera un momento antes de pedir otro c\xF3digo."):s(`No se pudo enviar el c\xF3digo: ${t.message}`)}},C=u("[data-reuse-email]",a);C&&C.addEventListener("click",async()=>{s("");try{await m("/api/v1/account/alert-email",{method:"POST"}),await p()}catch(e){s(e.message==="email_not_verified"?"Tu correo de acceso a\xFAn no est\xE1 confirmado.":`No se pudo usar este correo: ${e.message}`)}}),a.querySelectorAll("[data-commercial]").forEach(e=>{e.addEventListener("change",async t=>{let o=t.target.dataset.commercial,n=t.target.checked?"granted":"revoked";try{await m("/api/v1/account/consents",{method:"POST",body:JSON.stringify({purpose:"commercial",channel:o,action:n})})}catch(f){t.target.checked=!t.target.checked,s(f.message==="channel_not_available"?"A\xF1ade ese canal en \xABCanales de aviso\xBB antes de autorizar publicidad por \xE9l.":`No se pudo guardar el consentimiento: ${f.message}`)}})}),u("[data-profile-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);s("");try{await m("/api/v1/account/profile",{method:"PUT",body:JSON.stringify({municipality:t.get("municipality")||null,activity:t.get("activity")||null,crop_or_livestock:t.get("crop_or_livestock")||null,interest:t.get("interest")||null})}),await p()}catch(o){s(`No se pudo guardar el perfil: ${o.message}`)}}),u("[data-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);s("");let o=f=>t.get(f)==="on",n={receive_frost:o("receive_frost"),receive_heat:o("receive_heat"),receive_storm:o("receive_storm"),receive_wind:o("receive_wind"),receive_humidity:o("receive_humidity"),receive_general:o("receive_general"),channel_whatsapp:o("channel_whatsapp"),channel_email:o("channel_email"),quiet_start:t.get("quiet_start")||null,quiet_end:t.get("quiet_end")||null,zone:t.get("zone")||null,crop:t.get("crop")||null};try{await m("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify(n)}),await L(a)}catch(f){s(`No se pudieron guardar las preferencias: ${f.message}`)}}),u("[data-thresholds-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);s("");let o={};t.get("frost_c")&&(o.frost_c=Number(t.get("frost_c"))),t.get("heat_c")&&(o.heat_c=Number(t.get("heat_c")));try{await m("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({custom_thresholds:o})}),await L(a),u("[data-thresholds-ok]",a).textContent="Recibido. Lo revisamos contigo al ajustar el piloto; no cambia tus avisos."}catch(n){s(`No se pudieron enviar los umbrales: ${n.message}`)}});for(let e of S){u(`[data-contact-form="${e.key}"]`,a).addEventListener("submit",async h=>{h.preventDefault();let b=new FormData(h.currentTarget);s("");try{await m(`/api/v1/contacts/${e.key}`,{method:"PUT",body:JSON.stringify({address:b.get("address")??"",opt_in:b.get("opt_in")==="on",...e.key==="whatsapp"?{country:b.get("country")||w}:{}})}),await p()}catch(E){s(`No se pudo guardar ${e.label}: ${E.message}`)}});let o=u(`[data-verify="${e.key}"]`,a);o&&o.addEventListener("click",()=>_(e.key));let n=u(`[data-resend="${e.key}"]`,a);n&&n.addEventListener("click",()=>_(e.key));let f=u(`[data-confirm-form="${e.key}"]`,a);f&&f.addEventListener("submit",async h=>{h.preventDefault();let b=new FormData(h.currentTarget);s("");try{await m(`/api/v1/contacts/${e.key}/confirm`,{method:"POST",body:JSON.stringify({code:b.get("code")??""})}),await p()}catch(E){s(`No se pudo verificar ${e.label}: ${E.message}`)}})}u("[data-farm-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);s("");let o={name:t.get("name")??""};for(let n of["municipality","crop","livestock"])t.get(n)&&(o[n]=t.get(n));try{await m("/api/v1/farms",{method:"POST",body:JSON.stringify(o)}),await p()}catch(n){s(`No se pudo crear la finca: ${n.message}`)}}),a.querySelectorAll("[data-farm-delete]").forEach(e=>{e.addEventListener("click",async()=>{if(window.confirm("\xBFEliminar esta finca? Las estaciones no se borran.")){s("");try{await m(`/api/v1/farms/${e.dataset.farmDelete}`,{method:"DELETE"}),await p()}catch(t){s(`No se pudo eliminar la finca: ${t.message}`)}}})}),a.querySelectorAll("[data-farm-unlink]").forEach(e=>{e.addEventListener("click",async()=>{s("");try{await m(`/api/v1/farms/${e.dataset.farmUnlink}/devices/${encodeURIComponent(e.dataset.device)}`,{method:"DELETE"}),await p()}catch(t){s(`No se pudo quitar la estaci\xF3n: ${t.message}`)}})}),a.querySelectorAll("[data-farm-link]").forEach(e=>{e.addEventListener("submit",async t=>{t.preventDefault();let o=new FormData(t.currentTarget);s("");try{await m(`/api/v1/farms/${e.dataset.farmLink}/devices`,{method:"POST",body:JSON.stringify({device_id:o.get("device_id")})}),await p()}catch(n){s(`No se pudo asociar la estaci\xF3n: ${n.message}`)}})})}export{L as renderAccount};
