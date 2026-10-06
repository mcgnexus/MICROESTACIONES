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
