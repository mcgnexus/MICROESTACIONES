import{b as w}from"./chunk-7CRF2GWD.js";import{a as u,b as s,c as $,h as b,j as d,s as k,t as _}from"./chunk-CE22DNBG.js";var g=[{key:"whatsapp",label:"WhatsApp",placeholder:"+34 600 000 000",addressLabel:"Tel\xE9fono de WhatsApp"},{key:"email",label:"Correo",placeholder:"tu@correo.es",addressLabel:"Correo electr\xF3nico"}];function T(a,t){let m=!!t?.optedIn,v=!!t?.verified,p=t?`${v?"verificado":"sin verificar"} \xB7 ${m?"recibe avisos":"no recibe avisos"}`:"sin configurar";return`<div class="contact-block">
    <div class="section-heading"><div><h3>${a.label}</h3><p class="hint">${s(p)}</p></div></div>
    <form data-contact-form="${a.key}" class="rule-form">
      <label>${a.addressLabel}<input name="address" value="${s(t?.address||"")}" placeholder="${a.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${m?"checked":""}> Autorizar avisos por ${a.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${t&&!v?`<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${a.key}">Enviar c\xF3digo de verificaci\xF3n</button>
      <form data-confirm-form="${a.key}" class="rule-form hidden">
        <label>C\xF3digo recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar c\xF3digo</button>
      </form>
      <p class="hint" data-verify-hint="${a.key}"></p>
    </div>`:""}
  </div>`}function S(a,t){let m=a.devices||[],v=t.filter(p=>!m.includes(p.id)).map(p=>`<option value="${s(p.id)}">${s(p.name)}</option>`).join("");return`<div class="farm-block">
    <div class="section-heading">
      <div><h3>${s(a.name)}</h3><p class="hint">${s([a.municipality,a.crop,a.livestock].filter(Boolean).join(" \xB7 ")||"sin detalle")}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${s(a.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${m.length?m.map(p=>{let l=t.find(o=>o.id===p)?.name||p;return`<span class="chip">${s(l)}<button type="button" class="chip-remove" data-farm-unlink="${s(a.id)}" data-device="${s(p)}" aria-label="Quitar ${s(l)}">\xD7</button></span>`}).join(""):'<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${v?`<form data-farm-link="${s(a.id)}" class="rule-form">
      <label>Asociar estaci\xF3n<select name="device_id">${v}</select></label>
      <button type="submit">Asociar</button>
    </form>`:""}
  </div>`}var A={receiveFrost:!0,receiveHeat:!0,receiveStorm:!0,receiveWind:!0,receiveHumidity:!0,receiveGeneral:!0,channelWhatsapp:!0,channelEmail:!0,quietStart:null,quietEnd:null,zone:null,crop:null,customThresholds:{}};async function E(a){let t=b.me,m=t.contacts||[],v=Object.fromEntries(m.map(e=>[e.channel,e])),p=t.farms||[],l=await d("/api/v1/alert-preferences").then(e=>e.preferences).catch(()=>null)||A;a.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${s(t.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCI\xD3N</p><h2>Tu cuenta</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${s(k(t.role))}</dd>
        <dt>Plan</dt><dd>${s(_(t.plan))}</dd>
        <dt>Estaciones</dt><dd>${t.stations.map(e=>s(e.name)).join(", ")||"sin estaciones vinculadas"}</dd>
        <dt>Correo verificado</dt><dd>${t.emailVerifiedAt?`<span class="badge badge-valid">verificado ${$(t.emailVerifiedAt)}</span>`:'<span class="badge badge-warn">pendiente</span>'}</dd>
      </dl>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PUBLICIDAD</p><h2>Novedades y ofertas (opcional)</h2></div></div>
      <p class="hint">Usar la demo no depende de esto. Marca solo los canales por los que quieras recibir novedades y ofertas sobre microestaciones. Puedes retirarlos cuando quieras.</p>
      <div class="consent-grid">
        ${g.map(e=>{let i=!!t.consents?.commercial?.[e.key]?.granted,n=e.key==="email"||!!v.whatsapp;return`<label class="check"><input type="checkbox" data-commercial="${e.key}"
            ${i?"checked":""} ${n?"":"disabled"}> ${e.label}${n?"":" (a\xF1ade el canal arriba)"}</label>`}).join("")}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${s(t.consentTextVersion||"")}</strong>. Al revocar, se cancelan los env\xEDos comerciales pendientes.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PERFIL OPCIONAL</p><h2>Para afinar tus avisos</h2></div></div>
      <p class="hint">Rellenarlo es opcional: nos ayuda a ajustar los avisos a tu actividad y zona.</p>
      <form data-profile-form class="rule-form">
        <label>Municipio<input name="municipality" maxlength="120" value="${s(t.profile?.municipality||"")}"></label>
        <label>Actividad
          <select name="activity">
            <option value="">Selecciona\u2026</option>
            <option value="agricultura" ${t.profile?.activity==="agricultura"?"selected":""}>Agricultura</option>
            <option value="ganaderia" ${t.profile?.activity==="ganaderia"?"selected":""}>Ganader\xEDa</option>
            <option value="mixta" ${t.profile?.activity==="mixta"?"selected":""}>Agricultura y ganader\xEDa</option>
            <option value="otra" ${t.profile?.activity==="otra"?"selected":""}>Otra</option>
          </select>
        </label>
        <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${s(t.profile?.cropOrLivestock||"")}"></label>
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
      <div class="section-heading"><div><p class="eyebrow">DESTINATARIOS</p><h2>Canales de aviso</h2></div></div>
      <p class="hint">A\xF1ade tu WhatsApp o correo, autoriza el env\xEDo y verifica la direcci\xF3n. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${b.support?.whatsappDelivery==="manual"?`<p class="hint">${s(w)}</p>`:""}
      ${g.map(e=>T(e,v[e.key])).join("")}
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PREFERENCIAS</p><h2>Qu\xE9 alertas quieres recibir</h2></div></div>
      <p class="hint">No todos necesitan lo mismo: un almendro teme la helada y el ganado el calor. Elige aqu\xED tus avisos.</p>
      <form data-prefs-form class="rule-form">
        <fieldset class="prefs-group span-all"><legend>Tipos de aviso</legend>
          <label class="check"><input type="checkbox" name="receive_frost" ${l.receiveFrost?"checked":""}> Heladas</label>
          <label class="check"><input type="checkbox" name="receive_heat" ${l.receiveHeat?"checked":""}> Golpes de calor</label>
          <label class="check"><input type="checkbox" name="receive_storm" ${l.receiveStorm?"checked":""}> Tormentas</label>
          <label class="check"><input type="checkbox" name="receive_wind" ${l.receiveWind?"checked":""}> Viento</label>
          <label class="check"><input type="checkbox" name="receive_humidity" ${l.receiveHumidity?"checked":""}> Humedad</label>
          <label class="check"><input type="checkbox" name="receive_general" ${l.receiveGeneral?"checked":""}> Informaci\xF3n general</label>
        </fieldset>
        <fieldset class="prefs-group span-all"><legend>Canales</legend>
          <label class="check"><input type="checkbox" name="channel_whatsapp" ${l.channelWhatsapp?"checked":""}> WhatsApp</label>
          <label class="check"><input type="checkbox" name="channel_email" ${l.channelEmail?"checked":""}> Correo</label>
        </fieldset>
        <label>Silencio desde<input type="time" name="quiet_start" value="${s((l.quietStart||"").slice(0,5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${s((l.quietEnd||"").slice(0,5))}"></label>
        <label>Zona<input name="zone" maxlength="160" value="${s(l.zone||"")}"></label>
        <label>Cultivo o ganado<input name="crop" maxlength="160" value="${s(l.crop||"")}"></label>
        <label>Umbral propio de helada (\xB0C)<input type="number" step="0.5" name="frost_c" value="${l.customThresholds?.frost_c??""}"></label>
        <label>Umbral propio de calor (\xB0C)<input type="number" step="0.5" name="heat_c" value="${l.customThresholds?.heat_c??""}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias. Los umbrales propios son orientativos: <strong>todav\xEDa no cambian las reglas que disparan los avisos</strong>; se guardan como referencia para afinarlos m\xE1s adelante.</p>
        <button type="submit" class="span-all">Guardar preferencias</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MIS FINCAS</p><h2>Fincas y estaciones</h2></div></div>
      <p class="hint">Agrupa tus estaciones por finca para reconocer cada aviso por su nombre.</p>
      <div class="farm-list">${p.map(e=>S(e,t.stations)).join("")||'<p class="empty">Todav\xEDa no has creado ninguna finca.</p>'}</div>
      <form data-farm-form class="rule-form">
        <label>Nombre de la finca<input name="name" required minlength="2" maxlength="120"></label>
        <label>Municipio<input name="municipality" maxlength="120"></label>
        <label>Cultivo<input name="crop" maxlength="120"></label>
        <label>Ganado<input name="livestock" maxlength="120"></label>
        <button type="submit">A\xF1adir finca</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PILOTO</p><h2>\xBFQuieres alertas en otra finca?</h2></div></div>
      <p class="hint">Las solicitudes de piloto se gestionan desde la web p\xFAblica. Si conoces a alguien interesado, puedes compartir la direcci\xF3n de la portada.</p>
      <p class="hint"><a class="link" href="#/">Ir a la p\xE1gina p\xFAblica</a></p>
    </section>`;let o=e=>{u("[data-error]",a).textContent=e},f=async()=>{b.me=await d("/api/v1/me"),await E(a)};a.querySelectorAll("[data-commercial]").forEach(e=>{e.addEventListener("change",async i=>{let n=i.target.dataset.commercial,c=i.target.checked?"granted":"revoked";try{await d("/api/v1/account/consents",{method:"POST",body:JSON.stringify({purpose:"commercial",channel:n,action:c})})}catch(r){i.target.checked=!i.target.checked,o(r.message==="channel_not_available"?"A\xF1ade ese canal en \xABCanales de aviso\xBB antes de autorizar publicidad por \xE9l.":`No se pudo guardar el consentimiento: ${r.message}`)}})}),u("[data-profile-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);o("");try{await d("/api/v1/account/profile",{method:"PUT",body:JSON.stringify({municipality:i.get("municipality")||null,activity:i.get("activity")||null,crop_or_livestock:i.get("crop_or_livestock")||null,interest:i.get("interest")||null})}),await f()}catch(n){o(`No se pudo guardar el perfil: ${n.message}`)}}),u("[data-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);o("");let n=h=>i.get(h)==="on",c={receive_frost:n("receive_frost"),receive_heat:n("receive_heat"),receive_storm:n("receive_storm"),receive_wind:n("receive_wind"),receive_humidity:n("receive_humidity"),receive_general:n("receive_general"),channel_whatsapp:n("channel_whatsapp"),channel_email:n("channel_email"),quiet_start:i.get("quiet_start")||null,quiet_end:i.get("quiet_end")||null,zone:i.get("zone")||null,crop:i.get("crop")||null},r={};i.get("frost_c")&&(r.frost_c=Number(i.get("frost_c"))),i.get("heat_c")&&(r.heat_c=Number(i.get("heat_c"))),c.custom_thresholds=r;try{await d("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify(c)}),await E(a)}catch(h){o(`No se pudieron guardar las preferencias: ${h.message}`)}});for(let e of g){u(`[data-contact-form="${e.key}"]`,a).addEventListener("submit",async r=>{r.preventDefault();let h=new FormData(r.currentTarget);o("");try{await d(`/api/v1/contacts/${e.key}`,{method:"PUT",body:JSON.stringify({address:h.get("address")??"",opt_in:h.get("opt_in")==="on"})}),await f()}catch(y){o(`No se pudo guardar ${e.label}: ${y.message}`)}});let n=u(`[data-verify="${e.key}"]`,a);n&&n.addEventListener("click",async()=>{o("");try{let r=await d(`/api/v1/contacts/${e.key}/verify`,{method:"POST"});u(`[data-confirm-form="${e.key}"]`,a).classList.remove("hidden"),u(`[data-verify-hint="${e.key}"]`,a).textContent=r.devCode?`C\xF3digo de prueba: ${r.devCode}`:"Te hemos enviado un c\xF3digo. Introd\xFAcelo para verificar."}catch(r){o(`No se pudo enviar el c\xF3digo: ${r.message}`)}});let c=u(`[data-confirm-form="${e.key}"]`,a);c&&c.addEventListener("submit",async r=>{r.preventDefault();let h=new FormData(r.currentTarget);o("");try{await d(`/api/v1/contacts/${e.key}/confirm`,{method:"POST",body:JSON.stringify({code:h.get("code")??""})}),await f()}catch(y){o(`No se pudo verificar ${e.label}: ${y.message}`)}})}u("[data-farm-form]",a).addEventListener("submit",async e=>{e.preventDefault();let i=new FormData(e.currentTarget);o("");let n={name:i.get("name")??""};for(let c of["municipality","crop","livestock"])i.get(c)&&(n[c]=i.get(c));try{await d("/api/v1/farms",{method:"POST",body:JSON.stringify(n)}),await f()}catch(c){o(`No se pudo crear la finca: ${c.message}`)}}),a.querySelectorAll("[data-farm-delete]").forEach(e=>{e.addEventListener("click",async()=>{if(window.confirm("\xBFEliminar esta finca? Las estaciones no se borran.")){o("");try{await d(`/api/v1/farms/${e.dataset.farmDelete}`,{method:"DELETE"}),await f()}catch(i){o(`No se pudo eliminar la finca: ${i.message}`)}}})}),a.querySelectorAll("[data-farm-unlink]").forEach(e=>{e.addEventListener("click",async()=>{o("");try{await d(`/api/v1/farms/${e.dataset.farmUnlink}/devices/${encodeURIComponent(e.dataset.device)}`,{method:"DELETE"}),await f()}catch(i){o(`No se pudo quitar la estaci\xF3n: ${i.message}`)}})}),a.querySelectorAll("[data-farm-link]").forEach(e=>{e.addEventListener("submit",async i=>{i.preventDefault();let n=new FormData(i.currentTarget);o("");try{await d(`/api/v1/farms/${e.dataset.farmLink}/devices`,{method:"POST",body:JSON.stringify({device_id:n.get("device_id")})}),await f()}catch(c){o(`No se pudo asociar la estaci\xF3n: ${c.message}`)}})})}export{E as renderAccount};
