// Normalización única de teléfonos a E.164.
//
// Un número utilizable por el proveedor de WhatsApp lleva prefijo internacional.
// Se apoya en libphonenumber-js (metadatos por país) en vez de reglas propias
// incompletas: la misma función valida y normaliza en formulario, servidor,
// verificación, enlaces wa.me, exportación, deduplicación y bajas.
import {
  parsePhoneNumberFromString, getCountries, getCountryCallingCode, isSupportedCountry,
} from 'libphonenumber-js/min';

export const DEFAULT_COUNTRY = 'ES';

// Devuelve el número en E.164 (p. ej. «+34600123456») o null si no es válido.
// `600123456`, `+34 600 123 456` y `0034 600 123 456` producen el mismo valor;
// un número de otro país conserva su prefijo. Nunca se añade +34 a ciegas: solo
// resuelve el país por defecto cuando el número es nacional y válido.
export function normalizePhoneE164(value, defaultCountry = DEFAULT_COUNTRY) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > 40) return null;
  const country = isSupportedCountry(defaultCountry) ? defaultCountry : DEFAULT_COUNTRY;
  const parsed = parsePhoneNumberFromString(raw, country);
  return parsed?.isValid() ? parsed.number : null;
}

export function isValidContactPhone(value, defaultCountry = DEFAULT_COUNTRY) {
  return normalizePhoneE164(value, defaultCountry) !== null;
}

export function isSupportedCountryCode(code) {
  return isSupportedCountry(String(code || '').trim().toUpperCase());
}

const displayNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['es'], { type: 'region' }) : null;

const countryName = (code) => {
  try {
    return displayNames?.of(code) || code;
  } catch {
    return code;
  }
};

// Lista para el selector de país, con España primero y el resto por nombre.
export function countryOptions() {
  return getCountries()
    .map((code) => ({ code, callingCode: getCountryCallingCode(code), name: countryName(code) }))
    .filter((option) => option.name && option.name !== option.code)
    .sort((a, b) => (a.code === DEFAULT_COUNTRY ? -1
      : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name, 'es')));
}
