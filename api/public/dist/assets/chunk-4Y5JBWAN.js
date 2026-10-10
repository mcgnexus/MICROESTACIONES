import{a as g,b as $}from"./chunk-P6O2KU5M.js";import{b as A}from"./chunk-5CLIT5ZN.js";import{a as u,b as n,c as w,h as b,j as d,s as E,t as T}from"./chunk-VIDVWNWC.js";var k=[{key:"whatsapp",label:"WhatsApp",placeholder:"+34 600 000 000",addressLabel:"Tel\xE9fono de WhatsApp"},{key:"email",label:"Correo",placeholder:"tu@correo.es",addressLabel:"Correo electr\xF3nico"}];function C(a,i){let m=!!i?.optedIn,v=!!i?.verified,p=i?`${v?"verificado":"sin verificar"} \xB7 ${m?"recibe avisos":"no recibe avisos"}`:"sin configurar";return`<div class="contact-block">
    <div class="section-heading"><div><h3>${a.label}</h3><p class="hint">${n(p)}</p></div></div>
    <form data-contact-form="${a.key}" class="rule-form">
      <label>${a.addressLabel}<input name="address" value="${n(i?.address||"")}" placeholder="${a.placeholder}"></label>
      <label class="check"><input type="checkbox" name="opt_in" ${m?"checked":""}> Autorizar avisos por ${a.label.toLowerCase()}</label>
      <button type="submit">Guardar</button>
    </form>
    ${i&&!v?`<div class="contact-verify">
      <button type="button" class="quiet" data-verify="${a.key}">Enviar c\xF3digo de verificaci\xF3n</button>
      <form data-confirm-form="${a.key}" class="rule-form hidden">
        <label>C\xF3digo recibido<input name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code"></label>
        <button type="submit">Confirmar c\xF3digo</button>
      </form>
      <p class="hint" data-verify-hint="${a.key}"></p>
    </div>`:""}
  </div>`}function S(a,i){let m=a.devices||[],v=i.filter(p=>!m.includes(p.id)).map(p=>`<option value="${n(p.id)}">${n(p.name)}</option>`).join("");return`<div class="farm-block">
    <div class="section-heading">
      <div><h3>${n(a.name)}</h3><p class="hint">${n([a.municipality,a.crop,a.livestock].filter(Boolean).join(" \xB7 ")||"sin detalle")}</p></div>
      <button type="button" class="quiet danger" data-farm-delete="${n(a.id)}">Eliminar</button>
    </div>
    <div class="farm-devices">${m.length?m.map(p=>{let l=i.find(o=>o.id===p)?.name||p;return`<span class="chip">${n(l)}<button type="button" class="chip-remove" data-farm-unlink="${n(a.id)}" data-device="${n(p)}" aria-label="Quitar ${n(l)}">\xD7</button></span>`}).join(""):'<span class="hint">Sin estaciones asociadas.</span>'}</div>
    ${v?`<form data-farm-link="${n(a.id)}" class="rule-form">
      <label>Asociar estaci\xF3n<select name="device_id">${v}</select></label>
      <button type="submit">Asociar</button>
    </form>`:""}
  </div>`}var L={receiveFrost:!0,receiveHeat:!0,receiveStorm:!0,receiveWind:!0,receiveHumidity:!0,receiveGeneral:!0,channelWhatsapp:!0,channelEmail:!0,quietStart:null,quietEnd:null,zone:null,crop:null,customThresholds:{}};async function _(a){let i=b.me,m=i.contacts||[],v=Object.fromEntries(m.map(e=>[e.channel,e])),p=i.farms||[],l=await d("/api/v1/alert-preferences").then(e=>e.preferences).catch(()=>null)||L;a.innerHTML=`
    <div class="page-heading"><div><p class="eyebrow">CUENTA</p><h1>${n(i.email)}</h1></div></div>
    <p class="error" data-error role="alert"></p>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">SUSCRIPCI\xD3N</p><h2>Tu cuenta</h2></div></div>
      <dl class="detail-grid">
        <dt>Rol</dt><dd>${n(E(i.role))}</dd>
        <dt>Plan</dt><dd>${n(T(i.plan))}</dd>
        <dt>Estaciones</dt><dd>${i.stations.map(e=>n(e.name)).join(", ")||"sin estaciones vinculadas"}</dd>
        <dt>Correo verificado</dt><dd>${i.emailVerifiedAt?`<span class="badge badge-valid">verificado ${w(i.emailVerifiedAt)}</span>`:'<span class="badge badge-warn">pendiente</span>'}</dd>
      </dl>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PUBLICIDAD</p><h2>Novedades y ofertas (opcional)</h2></div></div>
      <p class="hint">Usar la demo no depende de esto. Marca solo los canales por los que quieras recibir novedades y ofertas sobre microestaciones. Puedes retirarlos cuando quieras.</p>
      <div class="consent-grid">
        ${k.map(e=>{let t=!!i.consents?.commercial?.[e.key]?.granted,s=e.key==="email"||!!v.whatsapp;return`<label class="check"><input type="checkbox" data-commercial="${e.key}"
            ${t?"checked":""} ${s?"":"disabled"}> ${e.label}${s?"":" (a\xF1ade el canal arriba)"}</label>`}).join("")}
      </div>
      <p class="hint">Texto informativo vigente: <strong>${n(i.consentTextVersion||"")}</strong>. Al revocar, se cancelan los env\xEDos comerciales pendientes.</p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">PERFIL OPCIONAL</p><h2>Para afinar tus avisos</h2></div></div>
      <p class="hint">Rellenarlo es opcional: nos ayuda a ajustar los avisos a tu actividad y zona.</p>
      <form data-profile-form class="rule-form">
        <label>Municipio<input name="municipality" maxlength="120" value="${n(i.profile?.municipality||"")}"></label>
        <label>Actividad
          <select name="activity">
            <option value="">Selecciona\u2026</option>
            <option value="agricultura" ${i.profile?.activity==="agricultura"?"selected":""}>Agricultura</option>
            <option value="ganaderia" ${i.profile?.activity==="ganaderia"?"selected":""}>Ganader\xEDa</option>
            <option value="mixta" ${i.profile?.activity==="mixta"?"selected":""}>Agricultura y ganader\xEDa</option>
            <option value="otra" ${i.profile?.activity==="otra"?"selected":""}>Otra</option>
          </select>
        </label>
        <label>Cultivo o especie<input name="crop_or_livestock" maxlength="120" value="${n(i.profile?.cropOrLivestock||"")}"></label>
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
      <div class="section-heading"><div><p class="eyebrow">DESTINATARIOS</p><h2>Canales de aviso</h2></div></div>
      <p class="hint">A\xF1ade tu WhatsApp o correo, autoriza el env\xEDo y verifica la direcci\xF3n. Las alertas solo salen a contactos verificados y autorizados.</p>
      ${b.support?.whatsappDelivery==="manual"?`<p class="hint">${n(A)}</p>`:""}
      ${k.map(e=>C(e,v[e.key])).join("")}
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
        <label>Silencio desde<input type="time" name="quiet_start" value="${n((l.quietStart||"").slice(0,5))}"></label>
        <label>Silencio hasta<input type="time" name="quiet_end" value="${n((l.quietEnd||"").slice(0,5))}"></label>
        <label>Zona<input name="zone" maxlength="160" value="${n(l.zone||"")}"></label>
        <label>Cultivo o ganado<input name="crop" maxlength="160" value="${n(l.crop||"")}"></label>
        <p class="hint span-all">El horario silencioso no frena las alertas prioritarias.</p>
        <button type="submit" class="span-all">Guardar preferencias</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">REFERENCIA PARA EL EQUIPO</p><h2>Umbrales que te servir\xEDan</h2></div></div>
      <p class="hint">Estos valores <strong>no cambian los avisos que recibes</strong>. Los umbrales que disparan las alertas los fija el equipo por estaci\xF3n y no se editan desde aqu\xED.</p>
      <p class="hint">D\xE9janos los que t\xFA usar\xEDas: los revisamos contigo al ajustar el piloto. Rellenarlo es opcional.</p>
      <form data-thresholds-form class="rule-form">
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa la helada (\xB0C)<input type="number" step="0.5" placeholder="${g}" name="frost_c" value="${l.customThresholds?.frost_c??""}"></label>
        <label>A partir de qu\xE9 \xB0C te preocupar\xEDa el calor (\xB0C)<input type="number" step="0.5" placeholder="${$}" name="heat_c" value="${l.customThresholds?.heat_c??""}"></label>
        <p class="hint span-all">En blanco = se queda el actual del equipo (${g} \xB0C helada, ${$} \xB0C calor).</p>
        <button type="submit" class="span-all">Enviar para el equipo</button>
      </form>
      <p class="hint" data-thresholds-ok role="status"></p>
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">MIS FINCAS</p><h2>Fincas y estaciones</h2></div></div>
      <p class="hint">Agrupa tus estaciones por finca para reconocer cada aviso por su nombre.</p>
      <div class="farm-list">${p.map(e=>S(e,i.stations)).join("")||'<p class="empty">Todav\xEDa no has creado ninguna finca.</p>'}</div>
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
    </section>`;let o=e=>{u("[data-error]",a).textContent=e},h=async()=>{b.me=await d("/api/v1/me"),await _(a)};a.querySelectorAll("[data-commercial]").forEach(e=>{e.addEventListener("change",async t=>{let s=t.target.dataset.commercial,c=t.target.checked?"granted":"revoked";try{await d("/api/v1/account/consents",{method:"POST",body:JSON.stringify({purpose:"commercial",channel:s,action:c})})}catch(r){t.target.checked=!t.target.checked,o(r.message==="channel_not_available"?"A\xF1ade ese canal en \xABCanales de aviso\xBB antes de autorizar publicidad por \xE9l.":`No se pudo guardar el consentimiento: ${r.message}`)}})}),u("[data-profile-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);o("");try{await d("/api/v1/account/profile",{method:"PUT",body:JSON.stringify({municipality:t.get("municipality")||null,activity:t.get("activity")||null,crop_or_livestock:t.get("crop_or_livestock")||null,interest:t.get("interest")||null})}),await h()}catch(s){o(`No se pudo guardar el perfil: ${s.message}`)}}),u("[data-prefs-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);o("");let s=r=>t.get(r)==="on",c={receive_frost:s("receive_frost"),receive_heat:s("receive_heat"),receive_storm:s("receive_storm"),receive_wind:s("receive_wind"),receive_humidity:s("receive_humidity"),receive_general:s("receive_general"),channel_whatsapp:s("channel_whatsapp"),channel_email:s("channel_email"),quiet_start:t.get("quiet_start")||null,quiet_end:t.get("quiet_end")||null,zone:t.get("zone")||null,crop:t.get("crop")||null};try{await d("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify(c)}),await _(a)}catch(r){o(`No se pudieron guardar las preferencias: ${r.message}`)}}),u("[data-thresholds-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);o("");let s={};t.get("frost_c")&&(s.frost_c=Number(t.get("frost_c"))),t.get("heat_c")&&(s.heat_c=Number(t.get("heat_c")));try{await d("/api/v1/alert-preferences",{method:"PUT",body:JSON.stringify({custom_thresholds:s})}),await _(a),u("[data-thresholds-ok]",a).textContent="Recibido. Lo revisamos contigo al ajustar el piloto; no cambia tus avisos."}catch(c){o(`No se pudieron enviar los umbrales: ${c.message}`)}});for(let e of k){u(`[data-contact-form="${e.key}"]`,a).addEventListener("submit",async r=>{r.preventDefault();let f=new FormData(r.currentTarget);o("");try{await d(`/api/v1/contacts/${e.key}`,{method:"PUT",body:JSON.stringify({address:f.get("address")??"",opt_in:f.get("opt_in")==="on"})}),await h()}catch(y){o(`No se pudo guardar ${e.label}: ${y.message}`)}});let s=u(`[data-verify="${e.key}"]`,a);s&&s.addEventListener("click",async()=>{o("");try{let r=await d(`/api/v1/contacts/${e.key}/verify`,{method:"POST"});u(`[data-confirm-form="${e.key}"]`,a).classList.remove("hidden"),u(`[data-verify-hint="${e.key}"]`,a).textContent=r.devCode?`C\xF3digo de prueba: ${r.devCode}`:"Te hemos enviado un c\xF3digo. Introd\xFAcelo para verificar."}catch(r){o(`No se pudo enviar el c\xF3digo: ${r.message}`)}});let c=u(`[data-confirm-form="${e.key}"]`,a);c&&c.addEventListener("submit",async r=>{r.preventDefault();let f=new FormData(r.currentTarget);o("");try{await d(`/api/v1/contacts/${e.key}/confirm`,{method:"POST",body:JSON.stringify({code:f.get("code")??""})}),await h()}catch(y){o(`No se pudo verificar ${e.label}: ${y.message}`)}})}u("[data-farm-form]",a).addEventListener("submit",async e=>{e.preventDefault();let t=new FormData(e.currentTarget);o("");let s={name:t.get("name")??""};for(let c of["municipality","crop","livestock"])t.get(c)&&(s[c]=t.get(c));try{await d("/api/v1/farms",{method:"POST",body:JSON.stringify(s)}),await h()}catch(c){o(`No se pudo crear la finca: ${c.message}`)}}),a.querySelectorAll("[data-farm-delete]").forEach(e=>{e.addEventListener("click",async()=>{if(window.confirm("\xBFEliminar esta finca? Las estaciones no se borran.")){o("");try{await d(`/api/v1/farms/${e.dataset.farmDelete}`,{method:"DELETE"}),await h()}catch(t){o(`No se pudo eliminar la finca: ${t.message}`)}}})}),a.querySelectorAll("[data-farm-unlink]").forEach(e=>{e.addEventListener("click",async()=>{o("");try{await d(`/api/v1/farms/${e.dataset.farmUnlink}/devices/${encodeURIComponent(e.dataset.device)}`,{method:"DELETE"}),await h()}catch(t){o(`No se pudo quitar la estaci\xF3n: ${t.message}`)}})}),a.querySelectorAll("[data-farm-link]").forEach(e=>{e.addEventListener("submit",async t=>{t.preventDefault();let s=new FormData(t.currentTarget);o("");try{await d(`/api/v1/farms/${e.dataset.farmLink}/devices`,{method:"POST",body:JSON.stringify({device_id:s.get("device_id")})}),await h()}catch(c){o(`No se pudo asociar la estaci\xF3n: ${c.message}`)}})})}export{_ as renderAccount};
