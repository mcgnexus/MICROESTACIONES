// Inspección SOLO LECTURA del histórico AEMET almacenado.
//
// Uso:  npm run aemet:check
//
// Ayuda a decidir si las observaciones AEMET guardadas pueden tener la hora
// desplazada por el antiguo supuesto de Madrid. No escribe ni corrige nada:
// la política prohíbe reescribir el histórico sin evidencia trazable.
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, {
  max: 2, ssl: 'require', transform: { ...postgres.camel, value: {} },
});

const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return '(desconocido)'; } })();

try {
  const [totals] = await sql`
    SELECT count(*)::int AS rows,
           count(DISTINCT device_id)::int AS devices,
           count(DISTINCT station_id)::int AS stations,
           min(observed_at) AS oldest, max(observed_at) AS newest,
           min(fetched_at) AS first_fetch, max(fetched_at) AS last_fetch
    FROM aemet_observations`;

  console.log(`Host: ${host}`);
  console.log(`aemet_observations: ${totals.rows} filas · ${totals.devices} estaciones locales · ${totals.stations} estaciones AEMET`);
  console.log(`  observed_at: ${totals.oldest?.toISOString?.() ?? '—'} → ${totals.newest?.toISOString?.() ?? '—'}`);
  console.log(`  fetched_at:  ${totals.firstFetch?.toISOString?.() ?? '—'} → ${totals.lastFetch?.toISOString?.() ?? '—'}`);

  // Las observaciones AEMET son horarias. Si TODAS caen en el minuto 0, la
  // desalineación por zona horaria no es detectable solo con esta tabla: un
  // desplazamiento de 1-2 h sigue dejando la marca en el minuto 0.
  const [alignment] = await sql`
    SELECT count(*) FILTER (WHERE date_part('minute', observed_at) = 0
                              AND date_part('second', observed_at) = 0)::int AS on_hour,
           count(*)::int AS total
    FROM aemet_observations`;
  console.log(`Alineación horaria: ${alignment.onHour}/${alignment.total} en el minuto 0`);

  // ¿Se guardó el valor original de `fint`? Sin él, una corrección trazable de
  // las filas antiguas no es posible.
  const columns = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'aemet_observations' ORDER BY column_name`;
  const names = columns.map((row) => row.columnName ?? row.column_name);
  console.log(`Columnas: ${names.join(', ')}`);
  const hasRaw = names.includes('raw_fint');
  console.log(`¿Guarda raw_fint? ${hasRaw ? 'sí' : 'NO'}`);

  if (!totals.rows) {
    console.log('\nNo hay observaciones almacenadas: no hay histórico que revisar.');
  } else if (!hasRaw) {
    console.log('\nConclusión: no se guardó `fint` original ni la regla aplicada, así que no');
    console.log('puede determinarse cuáles de las filas antiguas están desplazadas. Por política');
    console.log('no se reescriben por intuición. Acción: almacenar raw_fint y date_rule a partir');
    console.log('de ahora para que futuras correcciones sean trazables.');
  }
} finally {
  await sql.end();
}
