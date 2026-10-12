// Normalización de teléfonos a E.164 en el navegador, con los mismos metadatos
// que el servidor (libphonenumber-js). Se usa el build «min»: basta parsear y
// validar; el servidor vuelve a validar siempre.
import {
  parsePhoneNumberFromString, getCountries, getCountryCallingCode, isSupportedCountry,
} from 'libphonenumber-js/min';

export const DEFAULT_COUNTRY = 'ES';

// Devuelve E.164 (p. ej. «+34600123456») o null si no es válido para el país.
export function normalizePhoneE164(value, defaultCountry = DEFAULT_COUNTRY) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > 40) return null;
  const country = isSupportedCountry(defaultCountry) ? defaultCountry : DEFAULT_COUNTRY;
  const parsed = parsePhoneNumberFromString(raw, country);
  return parsed?.isValid() ? parsed.number : null;
}

const displayNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['es'], { type: 'region' }) : null;

function countryName(code) {
  try {
    return displayNames?.of(code) || code;
  } catch {
    return code;
  }
}

// Opciones del selector de país: España primero y el resto por nombre.
export function countryOptions() {
  return getCountries()
    .map((code) => ({ code, callingCode: getCountryCallingCode(code), name: countryName(code) }))
    .filter((option) => option.name && option.name !== option.code)
    .sort((a, b) => (a.code === DEFAULT_COUNTRY ? -1
      : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name, 'es')));
}
