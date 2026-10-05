// Contrato de configuración remota del dispositivo.
//
// Fuente de verdad de los límites: el firmware (firmware/tecrural_station/src/config.cpp).
// StationConfig::validate() rechaza la configuración COMPLETA si un solo valor se sale de
// rango, así que el servidor nunca debe aceptar un valor que el equipo no pueda aplicar.
//
// Cuando el firmware amplíe StationConfig basta con añadir aquí la clave con
// firmware: 'current'; la UI la mantendrá en el grupo reservado hasta que se marque.

export const CONFIG_GROUPS = [
  { id: 'medicion', label: 'Medición', hint: 'Cada cuánto el equipo toma una lectura.' },
  { id: 'envio', label: 'Envío', hint: 'Cada cuánto el equipo transmite lo medido. No puede estar durmiendo entre envíos.' },
  { id: 'bateria', label: 'Batería', hint: 'Umbrales con los que la estación avisa de su propia batería.' },
  { id: 'conectividad', label: 'Conectividad', hint: 'Reservado: el firmware actual no aplica estas claves.', firmware: 'pending' },
  { id: 'avisos', label: 'Umbrales de aviso', hint: 'La estación avisa por su cuenta y el servidor guarda el aviso.' },
];

export const CONFIG_RULES = {
  interval_normal_s: { kind: 'integer', min: 60, max: 86400, step: 60, unit: 's', group: 'medicion', label: 'Medir cada', default: 360 },
  interval_risk_s: { kind: 'integer', min: 60, max: 86400, step: 60, unit: 's', group: 'medicion', label: 'Medir cada (modo riesgo)', default: 300 },
  interval_risk_min_s: { kind: 'integer', min: 60, max: 86400, step: 60, unit: 's', group: 'medicion', label: 'Medir cada (mínimo en riesgo)', default: 60 },

  sync_interval_s: { kind: 'integer', min: 60, max: 86400, step: 60, unit: 's', group: 'envio', label: 'Enviar cada', default: 1800 },
  sync_enabled: { kind: 'boolean', group: 'envio', label: 'Envío activo', default: true },

  battery_low_mv: { kind: 'integer', min: 2500, max: 4200, step: 10, unit: 'mV', group: 'bateria', label: 'Batería baja', default: 3400 },
  battery_critical_mv: { kind: 'integer', min: 2000, max: 4200, step: 10, unit: 'mV', group: 'bateria', label: 'Batería crítica', default: 3200 },

  // El firmware todavía no lee estas claves: se guardan y se muestran como reservadas.
  wifi_timeout_s: { kind: 'integer', min: 5, max: 300, step: 5, unit: 's', group: 'conectividad', label: 'Límite de tiempo de conexión', default: 20, firmware: 'pending' },
  wifi_retry_interval_s: { kind: 'integer', min: 5, max: 60, step: 5, unit: 's', group: 'conectividad', label: 'Pausa entre reintentos', default: 15, firmware: 'pending' },
  wifi_max_retries: { kind: 'integer', min: 0, max: 10, step: 1, unit: 'intentos', group: 'conectividad', label: 'Reintentos por envío', default: 3, firmware: 'pending' },

  temp_alert_high_c: { kind: 'number', min: -40, max: 85, step: 0.5, unit: '°C', group: 'avisos', label: 'Temperatura alta', default: 35 },
  temp_alert_low_c: { kind: 'number', min: -40, max: 85, step: 0.5, unit: '°C', group: 'avisos', label: 'Temperatura baja', default: 2 },
  humidity_alert_high_pct: { kind: 'integer', min: 0, max: 100, step: 1, unit: '%', group: 'avisos', label: 'Humedad alta', default: 90 },
  pressure_alert_low_pa: { kind: 'integer', min: 30000, max: 110000, step: 100, unit: 'Pa', group: 'avisos', label: 'Presión baja', default: 88500 },
  risk_mode_enabled: { kind: 'boolean', group: 'avisos', label: 'Modo riesgo activo', default: true },
};

// Defaults que se ofrecen a una estación nueva: medida cada 6 min, envío cada 30 min.
export const CONFIG_DEFAULTS = Object.fromEntries(
  Object.entries(CONFIG_RULES).map(([key, rule]) => [key, rule.default]),
);

export const firmwarePendingKeys = () => Object.keys(CONFIG_RULES).filter((key) => CONFIG_RULES[key].firmware === 'pending');

const asNumber = (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);

// Validación dura: todo lo que el firmware no podría aplicar.
export function validateConfigObject(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, errors: [{ key: '_root', message: 'La configuración debe ser un objeto JSON' }] };
  }
  for (const [key, rawValue] of Object.entries(config)) {
    const rule = CONFIG_RULES[key];
    if (!rule) {
      errors.push({ key, message: `Clave no permitida. Válidas: ${Object.keys(CONFIG_RULES).join(', ')}` });
      continue;
    }
    const value = asNumber(rawValue);
    if (rule.kind === 'boolean') {
      if (typeof value !== 'boolean') errors.push({ key, message: 'Debe ser true o false' });
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push({ key, message: 'Debe ser un número' });
      continue;
    }
    if (rule.kind === 'integer' && !Number.isInteger(value)) errors.push({ key, message: 'Debe ser un entero' });
    if (value < rule.min || value > rule.max) errors.push({ key, message: `Fuera de rango (${rule.min}… ${rule.max})` });
  }
  // Relaciones que el firmware exige (si no, rechaza la configuración entera).
  const num = (key) => (typeof config[key] === 'number' ? config[key] : asNumber(config[key]));
  const relational = [
    ['interval_risk_s', 'interval_normal_s', (a, b) => a > b, 'el intervalo en modo riesgo no puede superar el intervalo normal'],
    ['interval_risk_min_s', 'interval_normal_s', (a, b) => a > b, 'el intervalo mínimo en riesgo no puede superar el intervalo normal'],
    ['battery_critical_mv', 'battery_low_mv', (a, b) => a >= b, 'la batería crítica debe ser inferior a la batería baja'],
    ['temp_alert_low_c', 'temp_alert_high_c', (a, b) => a >= b, 'el umbral de temperatura baja no puede superar el de temperatura alta'],
  ];
  for (const [key, otherKey, fails, message] of relational) {
    const value = num(key);
    const other = num(otherKey);
    if (typeof value === 'number' && typeof other === 'number' && fails(value, other)) {
      errors.push({ key, message: `${message} (${key} frente a ${otherKey})` });
    }
  }
  return { ok: errors.length === 0, errors };
}

// Avisos que no bloquean: ayudan a no agotar la batería ni dejar la estación sin datos.
export function configWarnings(config) {
  const warnings = [];
  const num = (key) => (typeof config?.[key] === 'number' ? config[key] : asNumber(config?.[key]));
  const interval = num('interval_normal_s');
  const sync = num('sync_interval_s');
  if (typeof interval === 'number' && interval < 120) {
    warnings.push({ key: 'interval_normal_s', message: 'Medir cada menos de 2 minutos multiplica el consumo de batería.' });
  }
  if (typeof interval === 'number' && interval > 7200) {
    warnings.push({ key: 'interval_normal_s', message: 'Intervalos de más de 2 horas dejan la estación sin datos útiles entre envíos.' });
  }
  if (typeof sync === 'number' && typeof interval === 'number' && sync < interval) {
    warnings.push({ key: 'sync_interval_s', message: 'El envío es más frecuente que la medición: el equipo transmite datos repetidos.' });
  }
  if (typeof sync === 'number' && sync > 14400) {
    warnings.push({ key: 'sync_interval_s', message: 'Enviar cada más de 4 horas deja el estado del equipo desactualizado en el panel.' });
  }
  return warnings;
}

// El firmware fusiona: parte de su configuración actual y aplica lo recibido.
// null en una clave la elimina, de modo que el equipo vuelve a su valor de fábrica.
export function mergeConfig(current, incoming) {
  const merged = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

// Estados de una versión: solicitado → recibido → aplicado.
// "Aplicado" solo existe si la ESP32-C3 lo confirma. Que el equipo siga
// enviando datos es un indicio, no una confirmación: no se da por aplicado.
export const CONFIG_STATES = ['solicitado', 'recibido', 'aplicado'];

export function versionState(row) {
  if (Number(row.confirmedVersion) === Number(row.version)) return 'aplicado';
  if (Number(row.requestedVersion) === Number(row.version)) return 'recibido';
  return 'solicitado';
}

// Indicio no concluyente: hubo datos posteriores a pedir la versión. Se muestra
// como pista, nunca como estado.
export function hasAppliedHint(row) {
  const dataAfter = row.dataAfter ? new Date(row.dataAfter).getTime() : null;
  const since = row.requestedAt ? new Date(row.requestedAt).getTime()
    : row.createdAt ? new Date(row.createdAt).getTime() : null;
  return dataAfter != null && since != null && dataAfter > since
    && Number(row.confirmedVersion) !== Number(row.version);
}

// Serie de estados con su marca temporal para el historial.
export function stateTimeline(row) {
  const state = versionState(row);
  return {
    solicitado: { done: true, at: row.createdAt ?? null },
    recibido: { done: state !== 'solicitado', at: state === 'solicitado' ? null : (row.requestedAt ?? null) },
    aplicado: { done: state === 'aplicado', at: state === 'aplicado' ? (row.appliedAt ?? null) : null },
  };
}

// Config efectiva: lo guardado y, para las claves ausentes, el valor de fábrica.
export function effectiveConfig(config) {
  return { ...CONFIG_DEFAULTS, ...(config || {}) };
}