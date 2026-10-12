import{a as T,c as D}from"./chunk-FDCKGUGI.js";import{a as C,b as L}from"./chunk-6OCCGOZS.js";import{a as R,b as j,c as B,d as U}from"./chunk-IMFDBYEP.js";import{b as F}from"./chunk-3GDF57X5.js";import{c as m,d as o,e as S,l as w,n as p,x,y as I}from"./chunk-IDTT5QG6.js";var z={sin_codigo:"Todav\xEDa no has pedido ning\xFAn c\xF3digo.",queued:"Estamos preparando tu c\xF3digo.",manual:"Tu c\xF3digo queda pendiente de env\xEDo manual durante el piloto.",sent:"C\xF3digo enviado. Introd\xFAcelo para verificar.",delivered:"C\xF3digo entregado. Introd\xFAcelo para verificar.",failed:"No se pudo enviar el c\xF3digo. Puedes reintentarlo.",expired:"El c\xF3digo ha caducado. Pide uno nuevo.",verified:"Destinatario verificado."},G=["delivered","failed","expired","verified"],M=3e3,J=12e4,_=new Map;function W(){for(let a of _.values())clearTimeout(a);_.clear()}var N=[{key:"whatsapp",label:"WhatsApp",placeholder:"600 000 000",addressLabel:"Tel\xE9fono de WhatsApp",inputType:"tel",autocomplete:"tel",inputmode:"tel"},{key:"email",label:"Correo",placeholder:"tu@correo.es",addressLabel:"Correo electr\xF3nico",inputType:"email",autocomplete:"email",inputmode:"email"}];function Y(){return`<select name="country">${D().map(a=>`<option value="${a.code}"${a.code===T?" selected":""}>${a.name} (+${a.callingCode})</option>`).join("")}</select>`}function Q(a,s,u){let v=!!s?.optedIn,d=!!s?.verified,y=s?`${d?"verificado":"sin verificar"} \xB7 ${v?"recibe avisos":"no recibe avisos"}`:"sin configurar",r=!!s&&!d&&!!u;return`<div class="contact-block">
    <div class="section-heading"><div><h3>${a.label}</h3><p class="hint">${o(y)}</p></div></div>
    <form data-contact-form="${a.key}" class="rule-form">
      ${a.key==="whatsapp"?`<label>Pa\xEDs del tel\xE9fono${Y()}</label>`:""}
      <label>${a.addressLabel}<input name="address" type="${a.inputType}" inputmode="${a.inputmode}" autocomplete="${a.autocomplete}" value="${o(s?.address||"")}" placeholder="${a.placeholder}"></label>
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
    ${s&&!d&&!u?`<p class="hint">La verificaci\xF3n por ${a.label} no est\xE1 disponible ahora mismo. Puedes guardar el contacto y verificarlo cuando el canal vuelva.</p>`:""}
  </div>`}var H={frost:"Heladas",heat:"Calor",storm:"Tormentas",wind:"Viento",humidity:"Humedad",general:"General"};function X(a,s){if(!a)return"";let{stations:u=[],subscriptions:v=[],interest:d={joined:!1}}=a,y=[{key:"email",label:"Correo"},{key:"whatsapp",label:"WhatsApp"}].filter(t=>(s.contacts||[]).some(l=>l.channel===t.key&&l.verified&&l.optedIn)),r=u.map(t=>{let l=v.find(f=>f.deviceId===t.id&&f.active),E=l?`<p class="hint">Suscrito por ${l.channel==="email"?"correo":"WhatsApp"} a: ${l.categories.map(f=>H[f]??f).join(", ")}.</p>
         <button type="button" data-public-cancel="${o(t.id)}" data-channel="${l.channel}">Cancelar suscripci\xF3n</button>
         <button type="button" data-public-test="${o(t.id)}" data-channel="${l.channel}">Enviar prueba</button>`:y.length?`<form data-public-form="${o(t.id)}" class="rule-form">
            <label>Canal<select name="channel">${y.map(f=>`<option value="${f.key}">${f.label}</option>`).join("")}</select></label>
            <fieldset><legend>Categor\xEDas</legend>${t.categories.map(f=>`<label class="check"><input type="checkbox" name="category" value="${f}" checked> ${H[f]??f}</label>`).join("")}</fieldset>
            <button type="submit">Activar avisos de esta estaci\xF3n</button>
          </form>`:'<p class="hint">Verifica un contacto m\xE1s arriba para poder suscribirte a esta estaci\xF3n.</p>';return`<div class="public-station">
      <div class="section-heading"><div><h3>${o(t.name)}</h3>
        <p class="hint">Zona: ${o(t.zone||"no indicada")} \xB7 \xDAltima medici\xF3n: ${t.lastDataAt?S(t.lastDataAt):"sin datos"}</p></div></div>
      ${E}
    </div>`}).join(""),g=u.length?"":`<div class="public-interest">
    <p class="hint">El servicio de avisos p\xFAblicos todav\xEDa no tiene estaciones habilitadas.</p>
    ${d.joined?'<p class="hint">Est\xE1s en la lista de inter\xE9s. Te avisaremos cuando se active.</p>':'<button type="button" data-public-interest>Apuntarme a la lista de inter\xE9s</button>'}
  </div>`;return`${r}${g}<p class="hint" data-public-hint></p>`}function Z(a,s){let u=s.email;return!a.emailVerifiedAt||u&&u.verified?"":`<div class="contact-verify">
    <p class="hint">Tu correo de acceso ya est\xE1 confirmado. Puedes usarlo para los avisos sin volver a verificarlo.</p>
    <button type="button" data-reuse-email>Usar este correo para los avisos</button>
  </div>`}function K(a,s){let u=U({me:{...a,contacts:a.contacts||[]},prefs:s,service:a.channelAvailability||{}}),v=(g,t=!1)=>g?"ok":t?"pending":"missing",d=[];for(let g of R){let t=u.channels[g],l=j[g];d.push({label:l,state:v(t.ready,t.configured),detail:t.ready?`Destinatario de ${l.toLowerCase()} verificado, autorizado y con el canal activo.`:t.configured?`Falta: ${t.missing.map(E=>B[E]).join(", ")}.`:`A\xF1ade ${l.toLowerCase()} y verif\xEDcalo para recibir avisos por este canal.`})}d.push({label:"Tipos de aviso",state:v(u.categories.selected,!0),detail:u.categories.selected?"Has elegido qu\xE9 avisos quieres recibir.":"Selecciona al menos un tipo de aviso abajo."}),d.push({label:"Estaci\xF3n o finca",state:v(u.stations),detail:u.stations?"Tu cuenta tiene estaci\xF3n o finca asociada.":"Crea una finca y as\xF3ciale tu estaci\xF3n."});let y={ok:"badge-valid",pending:"badge-warn",missing:"badge-invalid"},r={ok:"Listo",pending:"Pendiente",missing:"Falta"};return`<ol class="signup-steps avisos-steps">${d.map(g=>`<li><span class="badge ${y[g.state]}">${r[g.state]}</span><strong>${o(g.label)}</strong><span>${o(g.detail)}</span></li>`).join("")}</ol>`}function ee(a,s){let u=a.devices||[],v=s.filter(d=>!u.includes(d.id)).map(d=>`<option value="${o(d.id)}">${o(d.name)}</option>`).join("");return`<div class="farm-block">
    <div class="section-heading">
      <div><h3>${o(a.name)}</h3><p class="hint">${o([a.municipality,a.crop,a.livestock].filter(Boolean).join(" \xB7 ")||"sin detalle")}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${o(a.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${u.length?u.map(d=>{let y=s.find(r=>r.id===d)?.name||d;return`<span class="chip">${o(y)}<button type="button" class="chip-remove" data-farm-unlink="${o(a.id)}" data-device="${o(d)}" aria-label="Quitar ${o(y)}">\xD7</button></span>`}).join(""):'<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${v?`<form data-farm-link="${o(a.id)}" class="rule-form">
      <label>Asociar estaci\xF3n<select name="device_id">${v}</select></label>
      <button type="submit">Asociar</button>
    </form>`:""}
  </div>`}var ae={receiveFrost:!0,receiveHeat:!0,receiveStorm:!0,receiveWind:!0,receiveHumidity:!0,receiveGeneral:!0,channelWhatsapp:!0,channelEmail:!0,quietStart:null,quietEnd:null,zone:null,crop:null,customThresholds:{}};async function q(a){W();let s=w.me,u=s.contacts||[],v=Object.fromEntries(u.map(e=>[e.channel,e])),d=s.farms||[],y=s.channelAvailability||{},r=await p("/api/v1/alert-preferences").then(e=>e.preferences).catch(()=>null)||ae,g=await p("/api/v1/public-alerts/options").catch(()=>null);a.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${o(s.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CONFIGURACI\xD3N DE AVISOS</p><h2>Asistente de avisos</h2></div></div>
      <p class="hint">El estado se calcula por canal y destinatario: cada canal solo queda listo si, sobre el mismo contacto, est\xE1 verificado y autorizado, el canal sigue activo en preferencias, hay alg\xFAn tipo de aviso elegido, la cuenta tiene estaci\xF3n o finca y el servicio de ese canal est\xE1 disponible.</p>
      ${K(s,r)}
      <div class="section-heading"><div><h3>Contacto, autorizaci\xF3n y verificaci\xF3n</h3></div></div>
      <p class="hint">A\xF1ade tu WhatsApp o correo, autoriza el env\xEDo y verifica la direcci\xF3n. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${w.support?.whatsappDelivery==="manual"?`<p class="hint">${o(F)}</p>`:""}
      ${N.map(e=>Q(e,v[e.key],y[e.key])).join("")}
      ${Z(s,v)}
      <div class="section-heading"><div><h3>Avisos p\xFAblicos de estaci\xF3n</h3></div></div>
      <p class="hint">Suscr\xEDbete expresamente a los avisos de una estaci\xF3n habilitada por TecRural. Consultar datos o gr\xE1ficos no suscribe a nadie, y el acceso a una estaci\xF3n privada es otra cosa.</p>
      ${X(g,s)}
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
        <label>Silencio desde<input type="time" name="quiet_start" value="${o((r.quietStart||"").slice(0,5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${o((r.quietEnd||"").slice(0,5))}"></label>
        <label>Zona<input name="zone" maxlength="160" value="${o(r.zone||"")}"></label>
        <label>Cultivo o ganado<input name="crop" maxlength="160" value="${o(r.crop||"")}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias.</p>
        <button type="submit" class="span-all">Guardar preferencias</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MIS FINCAS</p><h2>Fincas y estaciones</h2></div></div>
      <p class="hint">Agrupa tus estaciones por finca para reconocer cada aviso por su nombre.</p>
      <div class="farm-list">${d.map(e=>ee(e,s.stations)).join("")||'<p class="empty">Todav\xEDa no has creado ninguna finca.</p>'}</div>
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
        <label>Municipio<input name="municipality" maxlength="120" value="${o(s.profile?.municipality||"")}"></label>
        <label>Actividad
          <select name="activity">
            <option value="">Selecciona\u2026</option>
            <option value="agricultura" ${s.profile?.activity==="agricultura"?"selected":""}>Agricultura</option>
            <option value="ganaderia" ${s.profile?.activity==="ganaderia"?"selected":""}>Ganader\xEDa</option>
            <option value="mixta" ${s.profile?.activity==="mixta"?"selected":""}>Agricultura y ganader\xEDa</option>
            <option value="otra" ${s.profile?.activity==="otra"?"selected":""}>Otra</option>
          </select>
        </label>
        <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${o(s.profile?.cropOrLivestock||"")}"></label>
        <label>Inter\xE9s principal
          <select name="interest">
            <option value="">Selecciona\u2026</option>
            <option value="heladas" ${s.profile?.interest==="heladas"?"selected":""}>Heladas</option>
            <option value="calor" ${s.profile?.interest==="calor"?"selected":""}>Golpes de calor</option>
            <option value="tormentas" ${s.profile?.interest==="tormentas"?"selected":""}>Tormentas</option>
            <option value="viento" ${s.profile?.interest==="viento"?"selected":""}>Viento</option>
            <option value="humedad" ${s.profile?.interest==="humedad"?"selected":""}>Humedad</option>
            <option value="general" ${s.profile?.interest==="general"?"selected":""}>Informaci\xF3n general</option>
            <option value="futura_instalacion" ${s.profile?.interest==="futura_instalacion"?"selected":""}>Futura instalaci\xF3n</option>
          </select>
        </label>
        <button type="submit">Guardar perfil</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCI\xD3N</p><h2>Tu cuenta</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${o(x(s.role))}</dd>
        <dt>Plan</dt><dd>${o(I(s.plan))}</dd>
        <dt>Estaciones</dt><dd>${s.stations.map(e=>o(e.name)).join(", ")||"sin estaciones vinculadas"}</dd>
        <dt>Correo de acceso verificado</dt><dd>${s.emailVerifiedAt?`<span class="badge badge-valid">verificado ${S(s.emailVerifiedAt)}</span>`:'<span class="badge badge-warn">pendiente</span>'}</dd>
      </dl>
      <p class="hint">Esta verificaci\xF3n es la del correo con el que entras: confirma tu acceso. Es distinta de la verificaci\xF3n por c\xF3digo de un destinatario de avisos, que se hace arriba, en cada canal.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">REFERENCIA PARA EL EQUIPO</p><h2>Umbrales que te servir\xEDan</h2></div></div>
      <p class="hint"><strong>Preferencia para valorar con el equipo. Todav\xEDa no modifica tus avisos.</strong> Estos valores no cambian los avisos que recibes: los umbrales que disparan las alertas los fija el equipo por estaci\xF3n y no se editan desde aqu\xED.</p>
      <p class="hint">D\xE9janos los que t\xFA usar\xEDas: los revisamos contigo al ajustar el piloto. Rellenarlo es opcional.</p>
      <form data-thresholds-form class="rule-form">
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa la helada (\xB0C)<input type="number" step="0.5" placeholder="${C}" name="frost_c" value="${r.customThresholds?.frost_c??""}"></label>
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa el calor (\xB0C)<input type="number" step="0.5" placeholder="${L}" name="heat_c" value="${r.customThresholds?.heat_c??""}"></label>
        <p class="hint span-all">En blanco = se queda el actual del equipo (${C} \xB0C helada, ${L} \xB0C calor).</p>
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
        ${N.map(e=>{let i=!!s.consents?.commercial?.[e.key]?.granted,n=e.key==="email"||!!v.whatsapp;return`<label class="check"><input type="checkbox" data-commercial="${e.key}"
            ${i?"checked":""} ${n?"":"disabled"}> ${e.label}${n?"":" (a\xF1ade el canal en Canales de aviso)"}</label>`}).join("")}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${o(s.consentTextVersion||"")}</strong>. Al revocar, se cancelan los env\xEDos comerciales pendientes.</p>
    </section>`;let t=e=>{m("[data-error]",a).textContent=e},l=async()=>{w.me=await p("/api/v1/me"),await q(a)},E=e=>{let i=Date.now(),n=async()=>{let c=null;try{c=await p(`/api/v1/contacts/${e}/verification`)}catch{c=null}if(c){let h=m(`[data-verify-state="${e}"]`,a);h&&(h.textContent=z[c.state]||"");let b=m(`[data-resend="${e}"]`,a);if(b){let $=c.resendAt?new Date(c.resendAt).getTime()-Date.now():0;b.classList.remove("hidden"),b.disabled=$>0,b.textContent=$>0?`Reenviar en ${Math.ceil($/1e3)} s`:"Reenviar c\xF3digo"}if(c.state==="verified"){_.delete(e),await l();return}if(G.includes(c.state)){_.delete(e);return}}if(Date.now()-i>J){_.delete(e);return}_.set(e,setTimeout(n,M))};n()},f=async e=>{t("");try{let i=await p(`/api/v1/contacts/${e}/verify`,{method:"POST"}),n=m(`[data-confirm-form="${e}"]`,a);n&&n.classList.remove("hidden");let c=m(`[data-verify-hint="${e}"]`,a);c&&(c.textContent=i.devCode?`C\xF3digo de prueba: ${i.devCode}`:"Estamos preparando tu c\xF3digo."),E(e)}catch(i){i.message==="channel_unavailable"?t("Este canal no est\xE1 disponible ahora mismo. Int\xE9ntalo m\xE1s tarde."):i.message==="cooldown"||i.message==="rate_limited"?t("Espera un momento antes de pedir otro c\xF3digo."):t(`No se pudo enviar el c\xF3digo: ${i.message}`)}},V=e=>{let i=m("[data-public-hint]",a);i?i.textContent=e:t(e)},k=e=>({station_not_found:"Esa estaci\xF3n no existe.",station_not_enabled:"Esa estaci\xF3n no tiene avisos p\xFAblicos habilitados.",account_not_verified:"Confirma primero tu correo de acceso.",contact_not_verified:"Verifica y autoriza el contacto de ese canal antes de suscribirte.",subscription_not_found:"No hay suscripci\xF3n activa para esa estaci\xF3n y canal."})[e.message]??`No se pudo completar: ${e.message}`;for(let e of a.querySelectorAll("[data-public-form]"))e.addEventListener("submit",async i=>{i.preventDefault(),t("");let n=e.dataset.publicForm,c=new FormData(e),h=[...e.querySelectorAll('input[name="category"]:checked')].map(b=>b.value);try{await p("/api/v1/public-alerts/subscribe",{method:"POST",body:JSON.stringify({device_id:n,channel:c.get("channel"),categories:h})}),await l()}catch(b){t(k(b))}});for(let e of a.querySelectorAll("[data-public-cancel]"))e.addEventListener("click",async()=>{t("");try{await p("/api/v1/public-alerts/unsubscribe",{method:"POST",body:JSON.stringify({device_id:e.dataset.publicCancel,channel:e.dataset.channel})}),await l()}catch(i){t(k(i))}});for(let e of a.querySelectorAll("[data-public-test]"))e.addEventListener("click",async()=>{t("");try{await p("/api/v1/public-alerts/test",{method:"POST",body:JSON.stringify({device_id:e.dataset.publicTest,channel:e.dataset.channel})}),V("Prueba en cola: llegar\xE1 etiquetada como PRUEBA, nunca como un episodio real.")}catch(i){t(k(i))}});let P=m("[data-public-interest]",a);P&&P.addEventListener("click",async()=>{t("");try{await p("/api/v1/public-alerts/interest",{method:"POST",body:JSON.stringify({})}),await l()}catch(e){t(k(e))}});let O=m("[data-reuse-email]",a);O&&O.addEventListener("click",async()=>{t("");try{await p("/api/v1/account/alert-email",{method:"POST"}),await l()}catch(e){t(e.message==="email_not_verified"?"Tu correo de acceso a\xFAn no est\xE1 confirmado.":`No se pudo usar este correo: ${e.message}`)}}),a.querySelectorAll("[data-commercial]").forEach(e=>{e.addEventListener("change",async i=>{let n=i.target.dataset.commercial,c=i.target.checked?"granted":"revoked";try{await p("/api/v1/account/consents",{method:"POST",body:JSON.stringify({purpose:"commercial",channel:n,action:c})})}catch(h){i.target.checked=!i.target.checked,t(h.message==="channel_not_available"?"A\xF1ade ese canal en \xABCanales de aviso\xBB antes de autorizar publicidad por \xE9l.":`No se pudo guardar el consentimiento: ${h.message}`)}})}),m("[data-profile-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");try{await p("/api/v1/account/profile",{method:"PUT",body:JSON.stringify({municipality:i.get("municipality")||null,activity:i.get("activity")||null,crop_or_livestock:i.get("crop_or_livestock")||null,interest:i.get("interest")||null})}),await l()}catch(n){t(`No se pudo guardar el perfil: ${n.message}`)}}),m("[data-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n=h=>i.get(h)==="on",c={receive_frost:n("receive_frost"),receive_heat:n("receive_heat"),receive_storm:n("receive_storm"),receive_wind:n("receive_wind"),receive_humidity:n("receive_humidity"),receive_general:n("receive_general"),channel_whatsapp:n("channel_whatsapp"),channel_email:n("channel_email"),quiet_start:i.get("quiet_start")||null,quiet_end:i.get("quiet_end")||null,zone:i.get("zone")||null,crop:i.get("crop")||null};try{await p("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify(c)}),await q(a)}catch(h){t(`No se pudieron guardar las preferencias: ${h.message}`)}}),m("[data-thresholds-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n={};i.get("frost_c")&&(n.frost_c=Number(i.get("frost_c"))),i.get("heat_c")&&(n.heat_c=Number(i.get("heat_c")));try{await p("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({custom_thresholds:n})}),await q(a),m("[data-thresholds-ok]",a).textContent="Recibido. Lo revisamos contigo al ajustar el piloto; no cambia tus avisos."}catch(c){t(`No se pudieron enviar los umbrales: ${c.message}`)}});for(let e of N){m(`[data-contact-form="${e.key}"]`,a).addEventListener("submit",async b=>{b.preventDefault();let $=new FormData(b.currentTarget);t("");try{await p(`/api/v1/contacts/${e.key}`,{method:"PUT",body:JSON.stringify({address:$.get("address")??"",opt_in:$.get("opt_in")==="on",...e.key==="whatsapp"?{country:$.get("country")||T}:{}})}),await l()}catch(A){t(`No se pudo guardar ${e.label}: ${A.message}`)}});let n=m(`[data-verify="${e.key}"]`,a);n&&n.addEventListener("click",()=>f(e.key));let c=m(`[data-resend="${e.key}"]`,a);c&&c.addEventListener("click",()=>f(e.key));let h=m(`[data-confirm-form="${e.key}"]`,a);h&&h.addEventListener("submit",async b=>{b.preventDefault();let $=new FormData(b.currentTarget);t("");try{await p(`/api/v1/contacts/${e.key}/confirm`,{method:"POST",body:JSON.stringify({code:$.get("code")??""})}),await l()}catch(A){t(`No se pudo verificar ${e.label}: ${A.message}`)}})}m("[data-farm-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n={name:i.get("name")??""};for(let c of["municipality","crop","livestock"])i.get(c)&&(n[c]=i.get(c));try{await p("/api/v1/farms",{method:"POST",body:JSON.stringify(n)}),await l()}catch(c){t(`No se pudo crear la finca: ${c.message}`)}}),a.querySelectorAll("[data-farm-delete]").forEach(e=>{e.addEventListener("click",async()=>{if(window.confirm("\xBFEliminar esta finca? Las estaciones no se borran.")){t("");try{await p(`/api/v1/farms/${e.dataset.farmDelete}`,{method:"DELETE"}),await l()}catch(i){t(`No se pudo eliminar la finca: ${i.message}`)}}})}),a.querySelectorAll("[data-farm-unlink]").forEach(e=>{e.addEventListener("click",async()=>{t("");try{await p(`/api/v1/farms/${e.dataset.farmUnlink}/devices/${encodeURIComponent(e.dataset.device)}`,{method:"DELETE"}),await l()}catch(i){t(`No se pudo quitar la estaci\xF3n: ${i.message}`)}})}),a.querySelectorAll("[data-farm-link]").forEach(e=>{e.addEventListener("submit",async i=>{i.preventDefault();let n=new FormData(i.currentTarget);t("");try{await p(`/api/v1/farms/${e.dataset.farmLink}/devices`,{method:"POST",body:JSON.stringify({device_id:n.get("device_id")})}),await l()}catch(c){t(`No se pudo asociar la estaci\xF3n: ${c.message}`)}})})}export{q as renderAccount};
