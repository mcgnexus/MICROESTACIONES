// Avisos en pantalla sencillos: éxito o error dentro de un bloque concreto.
// Un solo punto para no repetir la manipulación de mensajes en cada formulario.

export function showNotice(scope, selector, message) {
  const element = scope.querySelector(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden');
}

export function clearNotice(scope, selector) {
  const element = scope.querySelector(selector);
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
}

export function setError(scope, selector, message) {
  const element = scope.querySelector(selector);
  if (!element) return;
  element.textContent = message || '';
}

// ---- Alertas emergentes del navegador ---------------------------------------
// El panel refresca en silencio cada 15 min: si aparecen avisos abiertos
// nuevos, se muestran como notificación del navegador (si hay permiso).

export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function showBrowserNotification(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'tecrural-alerta' });
    return true;
  } catch {
    return false;
  }
}

// Diff puro: avisos abiertos cuyo identificador no estaba en el conjunto previo.
export function newAlertIds(knownIds, openAlerts) {
  const known = new Set(knownIds);
  return (openAlerts || []).filter((alert) => !known.has(String(alert.id)));
}
