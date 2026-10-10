import{a as y,b as $}from"./chunk-Z4YXSH7B.js";import{b as T}from"./chunk-3GDF57X5.js";import{c as f,d as n,e as w,k as b,m as u,v as E,w as A}from"./chunk-G5CTXHV7.js";var k=[{key:"whatsapp",label:"WhatsApp",placeholder:"+34 600 000 000",addressLabel:"Tel\xE9fono de WhatsApp",inputType:"tel",autocomplete:"tel",inputmode:"tel"},{key:"email",label:"Correo",placeholder:"tu@correo.es",addressLabel:"Correo electr\xF3nico",inputType:"email",autocomplete:"email",inputmode:"email"}];function C(a,t){let m=!!t?.optedIn,d=!!t?.verified,p=t?`${d?"verificado":"sin verificar"} \xB7 ${m?"recibe avisos":"no recibe avisos"}`:"sin configurar";return`<div class="contact-block">
    <div class="section-heading"><div><h3>${a.label}</h3><p class="hint">${n(p)}</p></div></div>
    <form data-contact-form="${a.key}" class="rule-form">
      <label>${a.addressLabel}<input name="address" type="${a.inputType}" inputmode="${a.inputmode}" autocomplete="${a.autocomplete}" value="${n(t?.address||"")}" placeholder="${a.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${m?"checked":""}> Autorizar avisos por ${a.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${t&&!d?`<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${a.key}">Enviar c\xF3digo de verificaci\xF3n</button>
      <form data-confirm-form="${a.key}" class="rule-form hidden">
        <label>C\xF3digo recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar c\xF3digo</button>
      </form>
      <p class="hint" data-verify-hint="${a.key}"></p>
    </div>`:""}
  </div>`}function S(a,t){let m=a.filter(o=>o.address),d=m.length>0,p=m.some(o=>o.optedIn),c=m.some(o=>o.verified),l=!!t&&[t.receiveFrost,t.receiveHeat,t.receiveStorm,t.receiveWind,t.receiveHumidity,t.receiveGeneral].some(Boolean),v=(o,r=!1)=>o?"ok":r?"pending":"missing",e=[{label:"Contacto",state:v(d),detail:d?"Hay un destinatario configurado.":"A\xF1ade tu WhatsApp o correo."},{label:"Autorizaci\xF3n",state:v(p,d),detail:d?p?"Autorizaste recibir avisos por ese canal.":"Marca la casilla de autorizaci\xF3n del canal.":"Primero hace falta un contacto."},{label:"Verificaci\xF3n",state:v(c,d),detail:d?c?"Destinatario verificado.":"Env\xEDa y confirma el c\xF3digo de verificaci\xF3n.":"Primero hace falta un contacto."},{label:"Preferencias efectivas",state:v(l,d),detail:d?l?"Elegiste qu\xE9 avisos quieres recibir.":"Selecciona al menos un tipo de aviso abajo.":"Primero hace falta un contacto."}],i={ok:"badge-valid",pending:"badge-warn",missing:"badge-invalid"},s={ok:"Listo",pending:"Pendiente",missing:"Falta"};return`<ol class="signup-steps avisos-steps">${e.map(o=>`<li><span class="badge ${i[o.state]}">${s[o.state]}</span><strong>${n(o.label)}</strong><span>${n(o.detail)}</span></li>`).join("")}</ol>`}function q(a,t){let m=a.devices||[],d=t.filter(p=>!m.includes(p.id)).map(p=>`<option value="${n(p.id)}">${n(p.name)}</option>`).join("");return`<div class="farm-block">
    <div class="section-heading">
      <div><h3>${n(a.name)}</h3><p class="hint">${n([a.municipality,a.crop,a.livestock].filter(Boolean).join(" \xB7 ")||"sin detalle")}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${n(a.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${m.length?m.map(p=>{let c=t.find(l=>l.id===p)?.name||p;return`<span class="chip">${n(c)}<button type="button" class="chip-remove" data-farm-unlink="${n(a.id)}" data-device="${n(p)}" aria-label="Quitar ${n(c)}">\xD7</button></span>`}).join(""):'<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${d?`<form data-farm-link="${n(a.id)}" class="rule-form">
      <label>Asociar estaci\xF3n<select name="device_id">${d}</select></label>
      <button type="submit">Asociar</button>
    </form>`:""}
  </div>`}var L={receiveFrost:!0,receiveHeat:!0,receiveStorm:!0,receiveWind:!0,receiveHumidity:!0,receiveGeneral:!0,channelWhatsapp:!0,channelEmail:!0,quietStart:null,quietEnd:null,zone:null,crop:null,customThresholds:{}};async function _(a){let t=b.me,m=t.contacts||[],d=Object.fromEntries(m.map(e=>[e.channel,e])),p=t.farms||[],c=await u("/api/v1/alert-preferences").then(e=>e.preferences).catch(()=>null)||L;a.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${n(t.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">CONFIGURACI\xD3N DE AVISOS</p><h2>Asistente de avisos</h2></div></div>
      <p class="hint">Cuatro pasos: contacto \u2192 autorizaci\xF3n \u2192 verificaci\xF3n \u2192 preferencias efectivas. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${S(m,c)}
      <div class="section-heading"><div><h3>Contacto, autorizaci\xF3n y verificaci\xF3n</h3></div></div>
      <p class="hint">A\xF1ade tu WhatsApp o correo, autoriza el env\xEDo y verifica la direcci\xF3n. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${b.support?.whatsappDelivery==="manual"?`<p class="hint">${n(T)}</p>`:""}
      ${k.map(e=>C(e,d[e.key])).join("")}
      <div class="section-heading"><div><h3>Preferencias efectivas</h3></div></div>
      <p class="hint">No todos necesitan lo mismo: un almendro teme la helada y el ganado el calor. Elige aqu\xED tus avisos.</p>
      <form data-prefs-form class="rule-form">
        <fieldset class="prefs-group span-all"><legend>Tipos de aviso</legend>
          <label class="check"><input type="checkbox" name="receive_frost" ${c.receiveFrost?"checked":""}> Heladas</label>
          <label class="check"><input type="checkbox" name="receive_heat" ${c.receiveHeat?"checked":""}> Golpes de calor</label>
          <label class="check"><input type="checkbox" name="receive_storm" ${c.receiveStorm?"checked":""}> Tormentas</label>
          <label class="check"><input type="checkbox" name="receive_wind" ${c.receiveWind?"checked":""}> Viento</label>
          <label class="check"><input type="checkbox" name="receive_humidity" ${c.receiveHumidity?"checked":""}> Humedad</label>
          <label class="check"><input type="checkbox" name="receive_general" ${c.receiveGeneral?"checked":""}> Informaci\xF3n general</label>
        </fieldset>
        <fieldset class="prefs-group span-all"><legend>Canales</legend>
          <label class="check"><input type="checkbox" name="channel_whatsapp" ${c.channelWhatsapp?"checked":""}> WhatsApp</label>
          <label class="check"><input type="checkbox" name="channel_email" ${c.channelEmail?"checked":""}> Correo</label>
        </fieldset>
        <label>Silencio desde<input type="time" name="quiet_start" value="${n((c.quietStart||"").slice(0,5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${n((c.quietEnd||"").slice(0,5))}"></label>
        <label>Zona<input name="zone" maxlength="160" value="${n(c.zone||"")}"></label>
        <label>Cultivo o ganado<input name="crop" maxlength="160" value="${n(c.crop||"")}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias.</p>
        <button type="submit" class="span-all">Guardar preferencias</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MIS FINCAS</p><h2>Fincas y estaciones</h2></div></div>
      <p class="hint">Agrupa tus estaciones por finca para reconocer cada aviso por su nombre.</p>
      <div class="farm-list">${p.map(e=>q(e,t.stations)).join("")||'<p class="empty">Todav\xEDa no has creado ninguna finca.</p>'}</div>
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
        <label>Municipio<input name="municipality" maxlength="120" value="${n(t.profile?.municipality||"")}"></label>
        <label>Actividad
          <select name="activity">
            <option value="">Selecciona\u2026</option>
            <option value="agricultura" ${t.profile?.activity==="agricultura"?"selected":""}>Agricultura</option>
            <option value="ganaderia" ${t.profile?.activity==="ganaderia"?"selected":""}>Ganader\xEDa</option>
            <option value="mixta" ${t.profile?.activity==="mixta"?"selected":""}>Agricultura y ganader\xEDa</option>
            <option value="otra" ${t.profile?.activity==="otra"?"selected":""}>Otra</option>
          </select>
        </label>
        <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${n(t.profile?.cropOrLivestock||"")}"></label>
        <label>Inter\xE9s principal
          <select name="interest">
            <option value="">Selecciona\u2026</option>
            <option value="heladas" ${t.profile?.interest==="heladas"?"selected":""}>Heladas</option>
            <option value="calor" ${t.profile?.interest==="calor"?"selected":""}>Golpes de calor</option>
            <option value="tormentas" ${t.profile?.interest==="tormentas"?"selected":""}>Tormentas</option>
            <option value="viento" ${t.profile?.interest==="viento"?"selected":""}>Viento</option>
            <option value="humedad" ${t.profile?.interest==="humedad"?"selected":""}>Humedad</option>
            <option value="general" ${t.profile?.interest==="general"?"selected":""}>Informaci\xF3n general</option>
            <option value="futura_instalacion" ${t.profile?.interest==="futura_instalacion"?"selected":""}>Futura instalaci\xF3n</option>
          </select>
        </label>
        <button type="submit">Guardar perfil</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCI\xD3N</p><h2>Tu cuenta</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${n(E(t.role))}</dd>
        <dt>Plan</dt><dd>${n(A(t.plan))}</dd>
        <dt>Estaciones</dt><dd>${t.stations.map(e=>n(e.name)).join(", ")||"sin estaciones vinculadas"}</dd>
        <dt>Correo de acceso verificado</dt><dd>${t.emailVerifiedAt?`<span class="badge badge-valid">verificado ${w(t.emailVerifiedAt)}</span>`:'<span class="badge badge-warn">pendiente</span>'}</dd>
      </dl>
      <p class="hint">Esta verificaci\xF3n es la del correo con el que entras: confirma tu acceso. Es distinta de la verificaci\xF3n por c\xF3digo de un destinatario de avisos, que se hace arriba, en cada canal.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">REFERENCIA PARA EL EQUIPO</p><h2>Umbrales que te servir\xEDan</h2></div></div>
      <p class="hint"><strong>Preferencia para valorar con el equipo. Todav\xEDa no modifica tus avisos.</strong> Estos valores no cambian los avisos que recibes: los umbrales que disparan las alertas los fija el equipo por estaci\xF3n y no se editan desde aqu\xED.</p>
      <p class="hint">D\xE9janos los que t\xFA usar\xEDas: los revisamos contigo al ajustar el piloto. Rellenarlo es opcional.</p>
      <form data-thresholds-form class="rule-form">
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa la helada (\xB0C)<input type="number" step="0.5" placeholder="${y}" name="frost_c" value="${c.customThresholds?.frost_c??""}"></label>
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa el calor (\xB0C)<input type="number" step="0.5" placeholder="${$}" name="heat_c" value="${c.customThresholds?.heat_c??""}"></label>
        <p class="hint span-all">En blanco = se queda el actual del equipo (${y} \xB0C helada, ${$} \xB0C calor).</p>
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
        ${k.map(e=>{let i=!!t.consents?.commercial?.[e.key]?.granted,s=e.key==="email"||!!d.whatsapp;return`<label class="check"><input type="checkbox" data-commercial="${e.key}"
            ${i?"checked":""} ${s?"":"disabled"}> ${e.label}${s?"":" (a\xF1ade el canal en Canales de aviso)"}</label>`}).join("")}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${n(t.consentTextVersion||"")}</strong>. Al revocar, se cancelan los env\xEDos comerciales pendientes.</p>
    </section>`;let l=e=>{f("[data-error]",a).textContent=e},v=async()=>{b.me=await u("/api/v1/me"),await _(a)};a.querySelectorAll("[data-commercial]").forEach(e=>{e.addEventListener("change",async i=>{let s=i.target.dataset.commercial,o=i.target.checked?"granted":"revoked";try{await u("/api/v1/account/consents",{method:"POST",body:JSON.stringify({purpose:"commercial",channel:s,action:o})})}catch(r){i.target.checked=!i.target.checked,l(r.message==="channel_not_available"?"A\xF1ade ese canal en \xABCanales de aviso\xBB antes de autorizar publicidad por \xE9l.":`No se pudo guardar el consentimiento: ${r.message}`)}})}),f("[data-profile-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);l("");try{await u("/api/v1/account/profile",{method:"PUT",body:JSON.stringify({municipality:i.get("municipality")||null,activity:i.get("activity")||null,crop_or_livestock:i.get("crop_or_livestock")||null,interest:i.get("interest")||null})}),await v()}catch(s){l(`No se pudo guardar el perfil: ${s.message}`)}}),f("[data-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);l("");let s=r=>i.get(r)==="on",o={receive_frost:s("receive_frost"),receive_heat:s("receive_heat"),receive_storm:s("receive_storm"),receive_wind:s("receive_wind"),receive_humidity:s("receive_humidity"),receive_general:s("receive_general"),channel_whatsapp:s("channel_whatsapp"),channel_email:s("channel_email"),quiet_start:i.get("quiet_start")||null,quiet_end:i.get("quiet_end")||null,zone:i.get("zone")||null,crop:i.get("crop")||null};try{await u("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify(o)}),await _(a)}catch(r){l(`No se pudieron guardar las preferencias: ${r.message}`)}}),f("[data-thresholds-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);l("");let s={};i.get("frost_c")&&(s.frost_c=Number(i.get("frost_c"))),i.get("heat_c")&&(s.heat_c=Number(i.get("heat_c")));try{await u("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({custom_thresholds:s})}),await _(a),f("[data-thresholds-ok]",a).textContent="Recibido. Lo revisamos contigo al ajustar el piloto; no cambia tus avisos."}catch(o){l(`No se pudieron enviar los umbrales: ${o.message}`)}});for(let e of k){f(`[data-contact-form="${e.key}"]`,a).addEventListener("submit",async r=>{r.preventDefault();let h=new FormData(r.currentTarget);l("");try{await u(`/api/v1/contacts/${e.key}`,{method:"PUT",body:JSON.stringify({address:h.get("address")??"",opt_in:h.get("opt_in")==="on"})}),await v()}catch(g){l(`No se pudo guardar ${e.label}: ${g.message}`)}});let s=f(`[data-verify="${e.key}"]`,a);s&&s.addEventListener("click",async()=>{l("");try{let r=await u(`/api/v1/contacts/${e.key}/verify`,{method:"POST"});f(`[data-confirm-form="${e.key}"]`,a).classList.remove("hidden"),f(`[data-verify-hint="${e.key}"]`,a).textContent=r.devCode?`C\xF3digo de prueba: ${r.devCode}`:"Te hemos enviado un c\xF3digo. Introd\xFAcelo para verificar."}catch(r){l(`No se pudo enviar el c\xF3digo: ${r.message}`)}});let o=f(`[data-confirm-form="${e.key}"]`,a);o&&o.addEventListener("submit",async r=>{r.preventDefault();let h=new FormData(r.currentTarget);l("");try{await u(`/api/v1/contacts/${e.key}/confirm`,{method:"POST",body:JSON.stringify({code:h.get("code")??""})}),await v()}catch(g){l(`No se pudo verificar ${e.label}: ${g.message}`)}})}f("[data-farm-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);l("");let s={name:i.get("name")??""};for(let o of["municipality","crop","livestock"])i.get(o)&&(s[o]=i.get(o));try{await u("/api/v1/farms",{method:"POST",body:JSON.stringify(s)}),await v()}catch(o){l(`No se pudo crear la finca: ${o.message}`)}}),a.querySelectorAll("[data-farm-delete]").forEach(e=>{e.addEventListener("click",async()=>{if(window.confirm("\xBFEliminar esta finca? Las estaciones no se borran.")){l("");try{await u(`/api/v1/farms/${e.dataset.farmDelete}`,{method:"DELETE"}),await v()}catch(i){l(`No se pudo eliminar la finca: ${i.message}`)}}})}),a.querySelectorAll("[data-farm-unlink]").forEach(e=>{e.addEventListener("click",async()=>{l("");try{await u(`/api/v1/farms/${e.dataset.farmUnlink}/devices/${encodeURIComponent(e.dataset.device)}`,{method:"DELETE"}),await v()}catch(i){l(`No se pudo quitar la estaci\xF3n: ${i.message}`)}})}),a.querySelectorAll("[data-farm-link]").forEach(e=>{e.addEventListener("submit",async i=>{i.preventDefault();let s=new FormData(i.currentTarget);l("");try{await u(`/api/v1/farms/${e.dataset.farmLink}/devices`,{method:"POST",body:JSON.stringify({device_id:s.get("device_id")})}),await v()}catch(o){l(`No se pudo asociar la estaci\xF3n: ${o.message}`)}})})}export{_ as renderAccount};
