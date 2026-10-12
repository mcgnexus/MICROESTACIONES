import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhoneE164, isValidContactPhone, countryOptions, isSupportedCountryCode, DEFAULT_COUNTRY,
} from './phone.js';

// Cambio 11: un solo formato internacional (E.164) para todo el sistema. La
// misma función valida en formulario, servidor, verificación, enlaces wa.me,
// exportación, deduplicación y bajas.

test('las formas equivalentes de un número español se resuelven igual', () => {
  const expected = '+34600123456';
  for (const value of ['600 123 456', '600123456', '+34 600 123 456', '0034 600 123 456', '(600) 123-456']) {
    assert.equal(normalizePhoneE164(value), expected, value);
  }
});

test('un número de otro país conserva su prefijo', () => {
  assert.equal(normalizePhoneE164('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(normalizePhoneE164('+1 202 555 0143'), '+12025550143');
  // El país explícito interpreta un nacional de ese país.
  assert.equal(normalizePhoneE164('6 12 34 56 78', 'FR'), '+33612345678');
});

test('no se añade +34 a ciegas', () => {
  // Una cadena que no es un número válido no se convierte con el país por defecto.
  assert.equal(normalizePhoneE164('123456789'), null);
  assert.equal(normalizePhoneE164('no-es-telefono'), null);
  assert.equal(normalizePhoneE164(''), null);
  assert.equal(normalizePhoneE164(null), null);
  assert.equal(isValidContactPhone('123456789'), false);
  // Un país desconocido no descarta el número: se usa el país por defecto.
  assert.equal(normalizePhoneE164('600123456', 'ZZ'), '+34600123456');
  assert.equal(isSupportedCountryCode('ZZ'), false);
  assert.equal(isSupportedCountryCode('ES'), true);
});

test('el selector de país ofrece España primero y no repite códigos', () => {
  const options = countryOptions();
  assert.equal(options[0].code, DEFAULT_COUNTRY);
  assert.equal(options[0].callingCode, '34');
  assert.ok(options.length > 100, 'la lista de países viene de los metadatos');
  const codes = options.map((option) => option.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(options.every((option) => option.name && option.callingCode));
});
