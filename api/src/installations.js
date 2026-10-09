// Instalaciones: la estación puede trasladarse a otro emplazamiento. Cada
// muestra queda ligada a la instalación vigente en su instante de observación
// por RANGO TEMPORAL, sin modificar la tabla `measurements`.

export function installationPayload(row) {
  return {
    id: String(row.id),
    deviceId: row.deviceId ?? row.device_id,
    siteName: row.siteName ?? row.site_name ?? null,
    locationType: row.locationType ?? row.location_type ?? null,
    zone: row.zone ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    altitude: row.altitude ?? null,
    heightM: row.heightM ?? row.height_m ?? null,
    shelter: row.shelter ?? null,
    maintenance: row.maintenance ?? [],
    notes: row.notes ?? null,
    startedAt: row.startedAt ?? row.started_at ?? null,
    endedAt: row.endedAt ?? row.ended_at ?? null,
  };
}

const timeOf = (value) => {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

// Instalación cuyo intervalo [started_at, ended_at) contiene el instante dado.
// Si varias encajaran (no debería), gana la de inicio más reciente. ended_at
// nulo = instalación vigente (abierta).
export function installationForTime(installations, at) {
  const time = timeOf(at);
  if (time == null) return null;
  let match = null;
  let matchStart = -Infinity;
  for (const installation of installations || []) {
    const start = timeOf(installation.startedAt ?? installation.started_at);
    if (start == null) continue;
    const endRaw = installation.endedAt ?? installation.ended_at;
    const end = endRaw == null ? Infinity : timeOf(endRaw);
    if (end == null) continue;
    if (time >= start && time < end && start >= matchStart) {
      match = installation;
      matchStart = start;
    }
  }
  return match;
}

// ¿La instalación estaba vigente (abierta) en el instante dado?
export function wasOpenAt(installation, at) {
  const time = timeOf(at);
  if (time == null) return false;
  const start = timeOf(installation?.startedAt ?? installation?.started_at);
  if (start == null || time < start) return false;
  const endRaw = installation?.endedAt ?? installation?.ended_at;
  return endRaw == null || time < timeOf(endRaw);
}
