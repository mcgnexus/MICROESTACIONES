// Preparación de avisos por canal y destinatario.
//
// Un canal está listo solo si, sobre el MISMO contacto, se cumplen todas las
// condiciones: está verificado, está autorizado, su canal sigue activo en las
// preferencias, hay al menos una categoría elegida, la cuenta tiene estación o
// finca y el servicio de ese canal está disponible. `categories` y `stations` se
// exponen aparte porque son estados propios: no dependen de que un contacto
// concreto esté completo, y completar un contacto no los activa por sí solo.

export const READINESS_CHANNELS = ['email', 'whatsapp'];
export const READINESS_CHANNEL_LABELS = { email: 'Correo', whatsapp: 'WhatsApp' };

// Etiqueta corta de cada condición que falta, para componer el detalle.
export const READINESS_MISSING_LABELS = {
  contact: 'falta añadir este canal',
  verified: 'sin verificar',
  authorized: 'sin autorización',
  preferences: 'canal apagado en preferencias',
  categories: 'sin tipos de aviso elegidos',
  land: 'sin estación ni finca',
  service: 'servicio del canal no disponible',
};

const CATEGORY_KEYS = [
  'receiveFrost', 'receiveHeat', 'receiveStorm', 'receiveWind', 'receiveHumidity', 'receiveGeneral',
];

// ¿Hay al menos un tipo de aviso elegido? Sin preferencias guardadas todavía no
// se puede afirmar que haya elección, así que queda pendiente (no «listo»).
export function categorySelected(prefs) {
  if (!prefs) return false;
  return CATEGORY_KEYS.some((key) => Boolean(prefs[key]));
}

export function alertReadiness({ me = {}, prefs = null, service = {}, prefsKnown } = {}) {
  const contacts = me.contacts || [];
  const stations = me.stations || [];
  const farms = me.farms || [];
  const hasLand = stations.length > 0 || farms.length > 0;
  const selected = categorySelected(prefs);
  // Si no se pudieron leer las preferencias (fallo transitorio), no se afirma
  // nada sobre categorías ni canales activos: no marcar «falta» por un error.
  const known = prefsKnown ?? (prefs != null);

  const channels = {};
  for (const key of READINESS_CHANNELS) {
    const contact = contacts.find((item) => item.channel === key) || null;
    const configured = Boolean(contact && contact.address);
    const missing = [];
    if (!configured) {
      missing.push('contact');
    } else {
      if (!contact.verified) missing.push('verified');
      if (!contact.optedIn) missing.push('authorized');
    }
    const channelOn = !prefs
      || (key === 'email' ? prefs.channelEmail !== false : prefs.channelWhatsapp !== false);
    if (known && !channelOn) missing.push('preferences');
    if (known && !selected) missing.push('categories');
    if (!hasLand) missing.push('land');
    if (service[key] === false) missing.push('service');
    channels[key] = {
      recipient: contact?.address ?? null,
      configured,
      ready: missing.length === 0,
      missing,
    };
  }

  return {
    channels,
    categories: { selected, known },
    stations: hasLand,
    anyReady: READINESS_CHANNELS.some((key) => channels[key].ready),
  };
}
