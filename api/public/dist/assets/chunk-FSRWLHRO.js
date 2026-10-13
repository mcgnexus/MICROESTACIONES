import{a as L,c as R}from"./chunk-FDCKGUGI.js";import{a as q,b as N}from"./chunk-EYRQAUHA.js";import{a as B,b as z,c as U,d as D}from"./chunk-IMFDBYEP.js";import{a as j}from"./chunk-ON2BMW5O.js";import{c as m,d as c,e as C,l as A,n as u,y as F,z as I}from"./chunk-VEUGMMMA.js";var V={sin_codigo:"Todav\xEDa no has pedido ning\xFAn c\xF3digo.",queued:"Estamos preparando tu c\xF3digo.",manual:"Tu c\xF3digo queda pendiente de env\xEDo manual durante el piloto.",sent:"C\xF3digo enviado. Introd\xFAcelo para verificar.",delivered:"C\xF3digo entregado. Introd\xFAcelo para verificar.",failed:"No se pudo enviar el c\xF3digo. Puedes reintentarlo.",expired:"El c\xF3digo ha caducado. Pide uno nuevo.",verified:"Destinatario verificado."},G=["delivered","failed","expired","verified"],J=3e3,M=12e4,k=new Map;function W(){for(let a of k.values())clearTimeout(a);k.clear()}var P=[{key:"whatsapp",label:"WhatsApp",placeholder:"600 000 000",addressLabel:"Tel\xE9fono de WhatsApp",inputType:"tel",autocomplete:"tel",inputmode:"tel"},{key:"email",label:"Correo",placeholder:"tu@correo.es",addressLabel:"Correo electr\xF3nico",inputType:"email",autocomplete:"email",inputmode:"email"}];function Y(){return`<select name="country">${R().map(a=>`<option value="${a.code}"${a.code===L?" selected":""}>${a.name} (+${a.callingCode})</option>`).join("")}</select>`}function Q(a,s,r){let v=!!s?.optedIn,p=!!s?.verified,$=s?`${p?"verificado":"sin verificar"} \xB7 ${v?"recibe avisos":"no recibe avisos"}`:"sin configurar",d=!!s&&!p&&!!r;return`<div class="contact-block">
    <div class="section-heading"><div><h3>${a.label}</h3><p class="hint">${c($)}</p></div></div>
    <form data-contact-form="${a.key}" class="rule-form">
      ${a.key==="whatsapp"?`<label>Pa\xEDs del tel\xE9fono${Y()}</label>`:""}
      <label>${a.addressLabel}<input name="address" type="${a.inputType}" inputmode="${a.inputmode}" autocomplete="${a.autocomplete}" value="${c(s?.address||"")}" placeholder="${a.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${v?"checked":""}> Autorizar avisos por ${a.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${d?`<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${a.key}">Enviar c\xF3digo de verificaci\xF3n</button>
      <button type="button" class="quiet hidden" data-resend="${a.key}">Reenviar c\xF3digo</button>
      <form data-confirm-form="${a.key}" class="rule-form hidden">
        <label>C\xF3digo recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar c\xF3digo</button>
      </form>
      <p class="hint" data-verify-hint="${a.key}"></p>
      <p class="hint" data-verify-state="${a.key}"></p>
    </div>`:""}
    ${s&&!p&&!r?`<p class="hint">La verificaci\xF3n por ${a.label} no est\xE1 disponible ahora mismo. Puedes guardar el contacto y verificarlo cuando el canal vuelva.</p>`:""}
  </div>`}var H={frost:"Heladas",heat:"Calor",storm:"Tormentas",wind:"Viento",humidity:"Humedad",general:"General"};function X(a,s){if(!a)return"";let{stations:r=[],subscriptions:v=[],interest:p={joined:!1}}=a,$=[{key:"email",label:"Correo"},{key:"whatsapp",label:"WhatsApp"}].filter(t=>(s.contacts||[]).some(l=>l.channel===t.key&&l.verified&&l.optedIn)),d=r.map(t=>{let l=v.find(f=>f.deviceId===t.id&&f.active),b=l?`<p class="hint">Suscrito por ${l.channel==="email"?"correo":"WhatsApp"} a: ${l.categories.map(f=>H[f]??f).join(", ")}.</p>
         <button type="button" data-public-cancel="${c(t.id)}" data-channel="${l.channel}">Cancelar suscripci\xF3n</button>
         <button type="button" data-public-test="${c(t.id)}" data-channel="${l.channel}">Enviar prueba</button>`:$.length?`<form data-public-form="${c(t.id)}" class="rule-form">
            <label>Canal<select name="channel">${$.map(f=>`<option value="${f.key}">${f.label}</option>`).join("")}</select></label>
            <fieldset><legend>Categor\xEDas</legend>${t.categories.map(f=>`<label class="check"><input type="checkbox" name="category" value="${f}" checked> ${H[f]??f}</label>`).join("")}</fieldset>
            <button type="submit">Activar avisos de esta estaci\xF3n</button>
          </form>`:'<p class="hint">Verifica un contacto m\xE1s arriba para poder suscribirte a esta estaci\xF3n.</p>';return`<div class="public-station">
      <div class="section-heading"><div><h3>${c(t.name)}</h3>
        <p class="hint">Zona: ${c(t.zone||"no indicada")} \xB7 \xDAltima medici\xF3n: ${t.lastDataAt?C(t.lastDataAt):"sin datos"}</p></div></div>
      ${b}
    </div>`}).join(""),h=r.length?"":`<div class="public-interest">
    <p class="hint">El servicio de avisos p\xFAblicos todav\xEDa no tiene estaciones habilitadas.</p>
    ${p.joined?'<p class="hint">Est\xE1s en la lista de inter\xE9s. Te avisaremos cuando se active.</p>':'<button type="button" data-public-interest>Apuntarme a la lista de inter\xE9s</button>'}
  </div>`;return`${d}${h}<p class="hint" data-public-hint></p>`}function Z(a,s){let r=s.email;return!a.emailVerifiedAt||r&&r.verified?"":`<div class="contact-verify">
    <p class="hint">Tu correo de acceso ya est\xE1 confirmado. Puedes usarlo para los avisos sin volver a verificarlo.</p>
    <button type="button" data-reuse-email>Usar este correo para los avisos</button>
  </div>`}function K(a,s){let r=D({me:{...a,contacts:a.contacts||[]},prefs:s,service:a.channelAvailability||{}}),v=(h,t=!1)=>h?"ok":t?"pending":"missing",p=[];for(let h of B){let t=r.channels[h],l=z[h];p.push({label:l,state:v(t.ready,t.configured),detail:t.ready?`Destinatario de ${l.toLowerCase()} verificado, autorizado y con el canal activo.`:t.configured?`Falta: ${t.missing.map(b=>U[b]).join(", ")}.`:`A\xF1ade ${l.toLowerCase()} y verif\xEDcalo para recibir avisos por este canal.`})}p.push({label:"Tipos de aviso",state:v(r.categories.selected,!0),detail:r.categories.selected?"Has elegido qu\xE9 avisos quieres recibir.":"Selecciona al menos un tipo de aviso abajo."}),p.push({label:"Estaci\xF3n o finca",state:v(r.stations),detail:r.stations?"Tu cuenta tiene estaci\xF3n o finca asociada.":"Crea una finca y as\xF3ciale tu estaci\xF3n."});let $={ok:"badge-valid",pending:"badge-warn",missing:"badge-invalid"},d={ok:"Listo",pending:"Pendiente",missing:"Falta"};return`<ol class="signup-steps avisos-steps">${p.map(h=>`<li><span class="badge ${$[h.state]}">${d[h.state]}</span><strong>${c(h.label)}</strong><span>${c(h.detail)}</span></li>`).join("")}</ol>`}function ee(a,s){let r=D({me:{...a,contacts:a.contacts||[]},prefs:s,service:a.channelAvailability||{}}),v=Object.values(r.channels),p=["contact","verified","authorized","preferences","service"],$=v.some(b=>b.configured&&!b.missing.some(f=>p.includes(f))),d=r.stations||r.categories.selected||v.some(b=>b.configured),h={location:r.stations?"ok":"missing",receive:r.categories.selected?"ok":"missing",channel:$?"ok":v.some(b=>b.configured)?"pending":"missing",check:r.anyReady?"ok":d?"pending":"missing"},t={ok:"Listo",pending:"Pendiente",missing:"Falta"};return`<nav class="account-guide" aria-label="Pasos para configurar avisos"><ol>${[["location","D\xF3nde est\xE1 mi finca"],["receive","Qu\xE9 quiero recibir"],["channel","C\xF3mo quiero recibirlo"],["check","Comprobar que funciona"]].map(([b,f],S)=>`<li><button type="button" data-account-jump="${b}" aria-controls="account-step-${b}"><span class="account-guide-number">${S+1}</span><span>${f}</span><span class="badge badge-${h[b]==="ok"?"valid":h[b]==="pending"?"warn":"invalid"}">${t[h[b]]}</span></button></li>`).join("")}</ol></nav>`}function ae(a,s){let r=a.devices||[],v=s.filter(p=>!r.includes(p.id)).map(p=>`<option value="${c(p.id)}">${c(p.name)}</option>`).join("");return`<div class="farm-block">
    <div class="section-heading">
      <div><h3>${c(a.name)}</h3><p class="hint">${c([a.municipality,a.crop,a.livestock].filter(Boolean).join(" \xB7 ")||"sin detalle")}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${c(a.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${r.length?r.map(p=>{let $=s.find(d=>d.id===p)?.name||p;return`<span class="chip">${c($)}<button type="button" class="chip-remove" data-farm-unlink="${c(a.id)}" data-device="${c(p)}" aria-label="Quitar ${c($)}">\xD7</button></span>`}).join(""):'<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${v?`<form data-farm-link="${c(a.id)}" class="rule-form">
      <label>Asociar estaci\xF3n<select name="device_id">${v}</select></label>
      <button type="submit">Asociar</button>
    </form>`:""}
  </div>`}var te={receiveFrost:!0,receiveHeat:!0,receiveStorm:!0,receiveWind:!0,receiveHumidity:!0,receiveGeneral:!0,channelWhatsapp:!0,channelEmail:!0,quietStart:null,quietEnd:null,zone:null,crop:null,customThresholds:{}};async function _(a){W();let s=A.me,r=s.contacts||[],v=Object.fromEntries(r.map(e=>[e.channel,e])),p=s.farms||[],$=s.channelAvailability||{},d=await u("/api/v1/alert-preferences").then(e=>e.preferences).catch(()=>null)||te,h=await u("/api/v1/public-alerts/options").catch(()=>null);a.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>Configura tus avisos</h1><p class="hint">Completa estas cuatro secciones en el orden que prefieras. Cada cambio se guarda por separado.</p></div></div>
    <p class="error" data-error role="alert"></p>
    ${ee(s,d)}
    <section id="account-step-location" data-account-step="location" class="panel account-guide-step">
      <div class="section-heading"><div><p class="eyebrow">PASO 1 DE 4</p><h2 tabindex="-1">D\xF3nde est\xE1 mi finca</h2></div></div>
      <p class="hint">A\xF1ade una finca y asocia la estaci\xF3n que mide all\xED. Tambi\xE9n puedes guardar una zona y cultivo habituales para contextualizar los avisos.</p>
      <form data-location-prefs-form class="rule-form">
        <label>Zona habitual (opcional)<input name="zone" maxlength="160" value="${c(d.zone||"")}"></label>
        <label>Cultivo habitual (opcional)<input name="crop" maxlength="160" value="${c(d.crop||"")}"></label>
        <button type="submit">Guardar zona y cultivo</button>
      </form>
      <div class="section-heading"><div><h3>Tus fincas y estaciones</h3></div></div>
      <div class="farm-list">${p.map(e=>ae(e,s.stations)).join("")||'<p class="empty">Todav\xEDa no has creado ninguna finca.</p>'}</div>
      <form data-farm-form class="rule-form">
        <label>Nombre de la finca<input name="name" required minlength="2" maxlength="120"></label>
        <label>Municipio<input name="municipality" maxlength="120"></label>
        <label>Cultivo<input name="crop" maxlength="120"></label>
        <label>Ganado<input name="livestock" maxlength="120"></label>
        <button type="submit">A\xF1adir finca</button>
      </form>
    </section>
    <section id="account-step-receive" data-account-step="receive" class="panel account-guide-step">
      <div class="section-heading"><div><p class="eyebrow">PASO 2 DE 4</p><h2 tabindex="-1">Qu\xE9 quiero recibir</h2></div></div>
      <p class="hint">Elige los tipos de aviso que te interesan. Cada estaci\xF3n p\xFAblica requiere adem\xE1s una suscripci\xF3n expl\xEDcita.</p>
      <form data-prefs-form class="rule-form">
        <fieldset class="prefs-group span-all"><legend>Tipos de aviso</legend>
          <label class="check"><input type="checkbox" name="receive_frost" ${d.receiveFrost?"checked":""}> Heladas</label>
          <label class="check"><input type="checkbox" name="receive_heat" ${d.receiveHeat?"checked":""}> Golpes de calor</label>
          <label class="check"><input type="checkbox" name="receive_storm" ${d.receiveStorm?"checked":""}> Tormentas</label>
          <label class="check"><input type="checkbox" name="receive_wind" ${d.receiveWind?"checked":""}> Viento</label>
          <label class="check"><input type="checkbox" name="receive_humidity" ${d.receiveHumidity?"checked":""}> Humedad</label>
          <label class="check"><input type="checkbox" name="receive_general" ${d.receiveGeneral?"checked":""}> Informaci\xF3n general</label>
        </fieldset>
        <button type="submit" class="span-all">Guardar qu\xE9 quiero recibir</button>
      </form>
      <div class="section-heading"><div><h3>Avisos p\xFAblicos de estaci\xF3n</h3></div></div>
      <p class="hint">Suscribirte aqu\xED a una estaci\xF3n p\xFAblica es independiente de tus avisos privados. Consultar sus datos no activa una suscripci\xF3n.</p>
      ${X(h,s)}
    </section>
    <section id="account-step-channel" data-account-step="channel" class="panel account-guide-step">
      <div class="section-heading"><div><p class="eyebrow">PASO 3 DE 4</p><h2 tabindex="-1">C\xF3mo quiero recibirlo</h2></div></div>
      <p class="hint">A\xF1ade el contacto, autoriza el canal y confirma el c\xF3digo de verificaci\xF3n. Solo se env\xEDan avisos a contactos verificados y autorizados.</p>
      ${A.support?.whatsappDelivery==="manual"?`<p class="hint">${c(j)}</p>`:""}
      ${P.map(e=>Q(e,v[e.key],$[e.key])).join("")}
      ${Z(s,v)}
      <form data-channel-prefs-form class="rule-form">
        <fieldset class="prefs-group span-all"><legend>Canales activos</legend>
          <label class="check"><input type="checkbox" name="channel_whatsapp" ${d.channelWhatsapp?"checked":""}> WhatsApp</label>
          <label class="check"><input type="checkbox" name="channel_email" ${d.channelEmail?"checked":""}> Correo</label>
        </fieldset>
        <label>Silencio desde<input type="time" name="quiet_start" value="${c((d.quietStart||"").slice(0,5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${c((d.quietEnd||"").slice(0,5))}"></label>
        <p class="hint span-all">El horario de silencio no frena los avisos prioritarios.</p>
        <button type="submit" class="span-all">Guardar c\xF3mo recibirlos</button>
      </form>
    </section>
    <section id="account-step-check" data-account-step="check" class="panel account-guide-step">
      <div class="section-heading"><div><p class="eyebrow">PASO 4 DE 4</p><h2 tabindex="-1">Comprobar que funciona</h2></div></div>
      <p class="hint">Aqu\xED puedes comprobar si cada canal est\xE1 listo. \xABListo\xBB significa que hay contacto verificado y autorizado, avisos seleccionados, finca vinculada y servicio disponible. Esta comprobaci\xF3n no env\xEDa una alerta privada de prueba.</p>
      ${K(s,d)}
      <p class="hint">Las pruebas de env\xEDo solo est\xE1n disponibles en suscripciones a avisos p\xFAblicos de estaci\xF3n.</p>
    </section>
    <details class="technical-details account-secondary">
      <summary>Datos y ajustes adicionales</summary>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">PERFIL OPCIONAL</p><h2>Datos para afinar tus avisos</h2></div></div>
        <p class="hint">Rellenarlo es opcional: ayuda al equipo a entender tu actividad y zona.</p>
        <form data-profile-form class="rule-form">
          <label>Municipio<input name="municipality" maxlength="120" value="${c(s.profile?.municipality||"")}"></label>
          <label>Actividad
            <select name="activity">
              <option value="">Selecciona\u2026</option>
              <option value="agricultura" ${s.profile?.activity==="agricultura"?"selected":""}>Agricultura</option>
              <option value="ganaderia" ${s.profile?.activity==="ganaderia"?"selected":""}>Ganader\xEDa</option>
              <option value="mixta" ${s.profile?.activity==="mixta"?"selected":""}>Agricultura y ganader\xEDa</option>
              <option value="otra" ${s.profile?.activity==="otra"?"selected":""}>Otra</option>
            </select>
          </label>
          <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${c(s.profile?.cropOrLivestock||"")}"></label>
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
        <div class="section-heading"><div><p class="eyebrow">REFERENCIA PARA EL EQUIPO</p><h2>L\xEDmites que te servir\xEDan</h2></div></div>
        <p class="hint"><strong>Estos valores son solo una referencia para el equipo: no modifican los avisos que recibes.</strong> Los l\xEDmites que disparan las alertas los fija el equipo por estaci\xF3n.</p>
        <p class="hint">D\xE9janos los que t\xFA usar\xEDas: los revisamos contigo al ajustar el piloto. Rellenarlo es opcional.</p>
        <form data-thresholds-form class="rule-form">
          <label>A partir de qu\xE9 \xB0C te preocupar\xEDa la helada (\xB0C)<input type="number" step="0.5" placeholder="${q}" name="frost_c" value="${d.customThresholds?.frost_c??""}"></label>
          <label>A partir de qu\xE9 \xB0C te preocupar\xEDa el calor (\xB0C)<input type="number" step="0.5" placeholder="${N}" name="heat_c" value="${d.customThresholds?.heat_c??""}"></label>
          <p class="hint span-all">En blanco = se queda el actual del equipo (${q} \xB0C helada, ${N} \xB0C calor).</p>
          <button type="submit" class="span-all">Enviar para el equipo</button>
        </form>
        <p class="hint" data-thresholds-ok role="status"></p>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">CUENTA</p><h2>Datos de suscripci\xF3n</h2></div></div>
        <dl class="detail-grid">
          <dt>Rol</dt><dd>${c(F(s.role))}</dd>
          <dt>Plan</dt><dd>${c(I(s.plan))}</dd>
          <dt>Estaciones</dt><dd>${s.stations.map(e=>c(e.name)).join(", ")||"sin estaciones vinculadas"}</dd>
          <dt>Correo de acceso verificado</dt><dd>${s.emailVerifiedAt?`<span class="badge badge-valid">verificado ${C(s.emailVerifiedAt)}</span>`:'<span class="badge badge-warn">pendiente</span>'}</dd>
        </dl>
        <p class="hint">Esta verificaci\xF3n es la del correo con el que entras; es distinta de la verificaci\xF3n por c\xF3digo de un destinatario de avisos.</p>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">PILOTO</p><h2>\xBFQuieres alertas en otra finca?</h2></div></div>
        <p class="hint">Las solicitudes para estudiar otra instalaci\xF3n se gestionan desde la web p\xFAblica.</p>
        <p class="hint"><a class="link" href="#/">Ir a la p\xE1gina p\xFAblica</a></p>
      </section>
    </details>
    <details class="technical-details account-commercial">
      <summary>Novedades y ofertas (opcional)</summary>
      <p class="hint">Este consentimiento es comercial; no cambia los avisos meteorol\xF3gicos. Puedes retirarlo cuando quieras.</p>
      <div class="consent-grid">
        ${P.map(e=>{let i=!!s.consents?.commercial?.[e.key]?.granted,n=e.key==="email"||!!v.whatsapp;return`<label class="check"><input type="checkbox" data-commercial="${e.key}"
            ${i?"checked":""} ${n?"":"disabled"}> ${e.label}${n?"":" (a\xF1ade el canal en \xABC\xF3mo quiero recibirlo\xBB)"} </label>`}).join("")}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${c(s.consentTextVersion||"")}</strong>. Al revocar, se cancelan los env\xEDos comerciales pendientes.</p>
    </details>`;let t=e=>{m("[data-error]",a).textContent=e},l=async()=>{A.me=await u("/api/v1/me"),await _(a)};a.querySelectorAll("[data-account-jump]").forEach(e=>{e.addEventListener("click",()=>{let n=a.querySelector(`#account-step-${e.dataset.accountJump}`)?.querySelector("h2");n&&(n.scrollIntoView({block:"start"}),n.focus({preventScroll:!0}))})});let b=e=>{let i=Date.now(),n=async()=>{let o=null;try{o=await u(`/api/v1/contacts/${e}/verification`)}catch{o=null}if(o){let g=m(`[data-verify-state="${e}"]`,a);g&&(g.textContent=V[o.state]||"");let y=m(`[data-resend="${e}"]`,a);if(y){let E=o.resendAt?new Date(o.resendAt).getTime()-Date.now():0;y.classList.remove("hidden"),y.disabled=E>0,y.textContent=E>0?`Reenviar en ${Math.ceil(E/1e3)} s`:"Reenviar c\xF3digo"}if(o.state==="verified"){k.delete(e),await l();return}if(G.includes(o.state)){k.delete(e);return}}if(Date.now()-i>M){k.delete(e);return}k.set(e,setTimeout(n,J))};n()},f=async e=>{t("");try{let i=await u(`/api/v1/contacts/${e}/verify`,{method:"POST"}),n=m(`[data-confirm-form="${e}"]`,a);n&&n.classList.remove("hidden");let o=m(`[data-verify-hint="${e}"]`,a);o&&(o.textContent=i.devCode?`C\xF3digo de prueba: ${i.devCode}`:"Estamos preparando tu c\xF3digo."),b(e)}catch(i){i.message==="channel_unavailable"?t("Este canal no est\xE1 disponible ahora mismo. Int\xE9ntalo m\xE1s tarde."):i.message==="cooldown"||i.message==="rate_limited"?t("Espera un momento antes de pedir otro c\xF3digo."):t(`No se pudo enviar el c\xF3digo: ${i.message}`)}},S=e=>{let i=m("[data-public-hint]",a);i?i.textContent=e:t(e)},w=e=>({station_not_found:"Esa estaci\xF3n no existe.",station_not_enabled:"Esa estaci\xF3n no tiene avisos p\xFAblicos habilitados.",account_not_verified:"Confirma primero tu correo de acceso.",contact_not_verified:"Verifica y autoriza el contacto de ese canal antes de suscribirte.",subscription_not_found:"No hay suscripci\xF3n activa para esa estaci\xF3n y canal."})[e.message]??`No se pudo completar: ${e.message}`;for(let e of a.querySelectorAll("[data-public-form]"))e.addEventListener("submit",async i=>{i.preventDefault(),t("");let n=e.dataset.publicForm,o=new FormData(e),g=[...e.querySelectorAll('input[name="category"]:checked')].map(y=>y.value);try{await u("/api/v1/public-alerts/subscribe",{method:"POST",body:JSON.stringify({device_id:n,channel:o.get("channel"),categories:g})}),await l()}catch(y){t(w(y))}});for(let e of a.querySelectorAll("[data-public-cancel]"))e.addEventListener("click",async()=>{t("");try{await u("/api/v1/public-alerts/unsubscribe",{method:"POST",body:JSON.stringify({device_id:e.dataset.publicCancel,channel:e.dataset.channel})}),await l()}catch(i){t(w(i))}});for(let e of a.querySelectorAll("[data-public-test]"))e.addEventListener("click",async()=>{t("");try{await u("/api/v1/public-alerts/test",{method:"POST",body:JSON.stringify({device_id:e.dataset.publicTest,channel:e.dataset.channel})}),S("Prueba en cola: llegar\xE1 etiquetada como PRUEBA, nunca como un episodio real.")}catch(i){t(w(i))}});let O=m("[data-public-interest]",a);O&&O.addEventListener("click",async()=>{t("");try{await u("/api/v1/public-alerts/interest",{method:"POST",body:JSON.stringify({})}),await l()}catch(e){t(w(e))}});let x=m("[data-reuse-email]",a);x&&x.addEventListener("click",async()=>{t("");try{await u("/api/v1/account/alert-email",{method:"POST"}),await l()}catch(e){t(e.message==="email_not_verified"?"Tu correo de acceso a\xFAn no est\xE1 confirmado.":`No se pudo usar este correo: ${e.message}`)}}),a.querySelectorAll("[data-commercial]").forEach(e=>{e.addEventListener("change",async i=>{let n=i.target.dataset.commercial,o=i.target.checked?"granted":"revoked";try{await u("/api/v1/account/consents",{method:"POST",body:JSON.stringify({purpose:"commercial",channel:n,action:o})})}catch(g){i.target.checked=!i.target.checked,t(g.message==="channel_not_available"?"A\xF1ade ese canal en \xABCanales de aviso\xBB antes de autorizar publicidad por \xE9l.":`No se pudo guardar el consentimiento: ${g.message}`)}})}),m("[data-profile-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");try{await u("/api/v1/account/profile",{method:"PUT",body:JSON.stringify({municipality:i.get("municipality")||null,activity:i.get("activity")||null,crop_or_livestock:i.get("crop_or_livestock")||null,interest:i.get("interest")||null})}),await l()}catch(n){t(`No se pudo guardar el perfil: ${n.message}`)}}),m("[data-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n=g=>i.get(g)==="on",o={receive_frost:n("receive_frost"),receive_heat:n("receive_heat"),receive_storm:n("receive_storm"),receive_wind:n("receive_wind"),receive_humidity:n("receive_humidity"),receive_general:n("receive_general")};try{await u("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify(o)}),await _(a)}catch(g){t(`No se pudieron guardar las preferencias: ${g.message}`)}}),m("[data-channel-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n=o=>i.get(o)==="on";try{await u("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({channel_whatsapp:n("channel_whatsapp"),channel_email:n("channel_email"),quiet_start:i.get("quiet_start")||null,quiet_end:i.get("quiet_end")||null})}),await _(a)}catch(o){t(`No se pudo guardar c\xF3mo recibir los avisos: ${o.message}`)}}),m("[data-location-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");try{await u("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({zone:i.get("zone")||null,crop:i.get("crop")||null})}),await _(a)}catch(n){t(`No se pudo guardar la zona de referencia: ${n.message}`)}}),m("[data-thresholds-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n={};i.get("frost_c")&&(n.frost_c=Number(i.get("frost_c"))),i.get("heat_c")&&(n.heat_c=Number(i.get("heat_c")));try{await u("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({custom_thresholds:n})}),await _(a),m("[data-thresholds-ok]",a).textContent="Recibido. Lo revisamos contigo al ajustar el piloto; no cambia tus avisos."}catch(o){t(`No se pudieron enviar los l\xEDmites: ${o.message}`)}});for(let e of P){m(`[data-contact-form="${e.key}"]`,a).addEventListener("submit",async y=>{y.preventDefault();let E=new FormData(y.currentTarget);t("");try{await u(`/api/v1/contacts/${e.key}`,{method:"PUT",body:JSON.stringify({address:E.get("address")??"",opt_in:E.get("opt_in")==="on",...e.key==="whatsapp"?{country:E.get("country")||L}:{}})}),await l()}catch(T){t(`No se pudo guardar ${e.label}: ${T.message}`)}});let n=m(`[data-verify="${e.key}"]`,a);n&&n.addEventListener("click",()=>f(e.key));let o=m(`[data-resend="${e.key}"]`,a);o&&o.addEventListener("click",()=>f(e.key));let g=m(`[data-confirm-form="${e.key}"]`,a);g&&g.addEventListener("submit",async y=>{y.preventDefault();let E=new FormData(y.currentTarget);t("");try{await u(`/api/v1/contacts/${e.key}/confirm`,{method:"POST",body:JSON.stringify({code:E.get("code")??""})}),await l()}catch(T){t(`No se pudo verificar ${e.label}: ${T.message}`)}})}m("[data-farm-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);t("");let n={name:i.get("name")??""};for(let o of["municipality","crop","livestock"])i.get(o)&&(n[o]=i.get(o));try{await u("/api/v1/farms",{method:"POST",body:JSON.stringify(n)}),await l()}catch(o){t(`No se pudo crear la finca: ${o.message}`)}}),a.querySelectorAll("[data-farm-delete]").forEach(e=>{e.addEventListener("click",async()=>{if(window.confirm("\xBFEliminar esta finca? Las estaciones no se borran.")){t("");try{await u(`/api/v1/farms/${e.dataset.farmDelete}`,{method:"DELETE"}),await l()}catch(i){t(`No se pudo eliminar la finca: ${i.message}`)}}})}),a.querySelectorAll("[data-farm-unlink]").forEach(e=>{e.addEventListener("click",async()=>{t("");try{await u(`/api/v1/farms/${e.dataset.farmUnlink}/devices/${encodeURIComponent(e.dataset.device)}`,{method:"DELETE"}),await l()}catch(i){t(`No se pudo quitar la estaci\xF3n: ${i.message}`)}})}),a.querySelectorAll("[data-farm-link]").forEach(e=>{e.addEventListener("submit",async i=>{i.preventDefault();let n=new FormData(i.currentTarget);t("");try{await u(`/api/v1/farms/${e.dataset.farmLink}/devices`,{method:"POST",body:JSON.stringify({device_id:n.get("device_id")})}),await l()}catch(o){t(`No se pudo asociar la estaci\xF3n: ${o.message}`)}})})}export{_ as renderAccount};
