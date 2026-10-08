// Servidor MCP (Model Context Protocol) sin estado sobre HTTP, en /mcp.
// Herramienta interna de administración: acceso de SOLO LECTURA a las
// microestaciones para agentes de IA (OpenClaw, Hermes), que son clientes MCP.
//
// Autenticación: `Authorization: Bearer $MCP_TOKEN`. Sin token configurado el
// endpoint responde 503 (desactivado). El token es un secreto del servidor, se
// compara en tiempo constante y se revoca cambiando la variable de entorno.
//
// Implementación propia del protocolo (JSON-RPC 2.0) en lugar del SDK oficial:
// la superficie es mínima (initialize, ping, tools/list, tools/call), evita
// añadir dependencias y conflictos de zod, y mantiene todo testeable con un
// cliente sql falso, igual que pipeline.test.js.
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { sql } from './db.js';
import { audit } from './audit.js';
import { connectivityFor, dataFreshnessFor } from './station-status.js';

const PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18'];
const LATEST_PROTOCOL_VERSION = PROTOCOL_VERSIONS[PROTOCOL_VERSIONS.length - 1];
const SERVER_INFO = { name: 'tecrural-mcp', version: '1.0.0' };

// Error de argumentos o de entidad: llega al agente como resultado con
// isError, no como fallo del transporte.
class McpInputError extends Error {}

const clampInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

// Ventana temporal común de history/summary: from/to explícitos o N horas atrás.
function resolveWindow(args) {
  const to = args.to ? new Date(String(args.to)) : new Date();
  if (Number.isNaN(to.getTime())) throw new McpInputError('`to` no es una fecha ISO 8601 válida.');
  let from;
  if (args.from) {
    from = new Date(String(args.from));
    if (Number.isNaN(from.getTime())) throw new McpInputError('`from` no es una fecha ISO 8601 válida.');
  } else {
    const hours = clampInt(args.hours ?? 24, 24, 1, 720);
    from = new Date(to.getTime() - hours * 3600 * 1000);
  }
  if (from >= to) throw new McpInputError('El rango de fechas no es válido: `from` debe ser anterior a `to`.');
  return { from, to };
}

async function requireStation(db, deviceId) {
  const id = String(deviceId ?? '').trim();
  if (!id || id.length > 80) throw new McpInputError('Falta un `device_id` válido.');
  const [station] = await db`SELECT d.id, d.name, ds.last_valid_data, c.config
    FROM devices d
    LEFT JOIN device_status ds ON ds.device_id = d.id
    LEFT JOIN device_configs c ON c.device_id = d.id
    WHERE d.id = ${id}`;
  if (!station) throw new McpInputError(`Estación desconocida: ${id}`);
  return station;
}

const reading = (row) => ({
  observedAt: row.observedAt,
  temperatureC: row.temperatureC,
  humidityPct: row.humidityPct,
  pressurePa: row.pressurePa,
  batteryMv: row.batteryMv,
  lux: row.lux,
});

// ---- Herramientas de solo lectura ------------------------------------------
export const MCP_TOOLS = [
  {
    name: 'list_stations',
    description: 'Lista todas las microestaciones con su estado operativo: conexión, frescura de datos y última lectura válida.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run(db) {
      const rows = await db`SELECT d.id, d.name, d.public_zone, d.location_type, d.active, d.publish_permission,
          ds.last_contact, ds.last_valid_data, c.config
        FROM devices d
        LEFT JOIN device_status ds ON ds.device_id = d.id
        LEFT JOIN device_configs c ON c.device_id = d.id
        ORDER BY d.name`;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        zone: row.publicZone ?? null,
        locationType: row.locationType,
        active: row.active,
        published: row.publishPermission,
        connectivity: connectivityFor(row.lastContact, row.config?.sync_interval_s),
        dataFreshness: dataFreshnessFor(row.lastValidData, row.config?.interval_normal_s),
        lastContact: row.lastContact ?? null,
        lastValidData: row.lastValidData ?? null,
      }));
    },
  },
  {
    name: 'get_station_latest',
    description: 'Última medición validada de una estación: temperatura, humedad, presión, batería e iluminancia, con su hora y frescura.',
    inputSchema: {
      type: 'object',
      required: ['device_id'],
      properties: { device_id: { type: 'string', description: 'Identificador de la estación, p. ej. esp32c3-01' } },
      additionalProperties: false,
    },
    async run(db, args) {
      const station = await requireStation(db, args.device_id);
      const [latest] = await db`SELECT observed_at, temperature_c, humidity_pct, pressure_pa, battery_mv, lux
        FROM measurements
        WHERE device_id = ${station.id} AND is_validated AND deleted_at IS NULL
        ORDER BY observed_at DESC, received_at DESC
        LIMIT 1`;
      return {
        station: { id: station.id, name: station.name },
        latest: latest ? reading(latest) : null,
        dataFreshness: dataFreshnessFor(station.lastValidData, station.config?.interval_normal_s),
      };
    },
  },
  {
    name: 'get_station_history',
    description: 'Serie de mediciones validadas de una estación en una ventana temporal. Por defecto las últimas 24 horas; máximo 500 muestras.',
    inputSchema: {
      type: 'object',
      required: ['device_id'],
      properties: {
        device_id: { type: 'string' },
        hours: { type: 'number', description: 'Horas hacia atrás desde `to` (1-720; por defecto 24). Se ignora si se indica `from`.' },
        from: { type: 'string', description: 'Inicio ISO 8601 (opcional)' },
        to: { type: 'string', description: 'Fin ISO 8601 (por defecto ahora)' },
        limit: { type: 'number', description: 'Muestras máximo (1-500; por defecto 200)' },
      },
      additionalProperties: false,
    },
    async run(db, args) {
      const station = await requireStation(db, args.device_id);
      const { from, to } = resolveWindow(args);
      const limit = clampInt(args.limit ?? 200, 200, 1, 500);
      const rows = await db`SELECT observed_at, temperature_c, humidity_pct, pressure_pa, battery_mv, lux
        FROM measurements
        WHERE device_id = ${station.id} AND is_validated AND deleted_at IS NULL
          AND observed_at >= ${from} AND observed_at < ${to}
        ORDER BY observed_at ASC
        LIMIT ${limit}`;
      return {
        station: { id: station.id, name: station.name },
        from: from.toISOString(),
        to: to.toISOString(),
        count: rows.length,
        measurements: rows.map(reading),
      };
    },
  },
  {
    name: 'get_station_summary',
    description: 'Resumen estadístico validado de una estación en una ventana: número de muestras y mínimo, máximo y media de temperatura, humedad y presión.',
    inputSchema: {
      type: 'object',
      required: ['device_id'],
      properties: {
        device_id: { type: 'string' },
        hours: { type: 'number', description: 'Horas hacia atrás desde `to` (1-720; por defecto 24). Se ignora si se indica `from`.' },
        from: { type: 'string', description: 'Inicio ISO 8601 (opcional)' },
        to: { type: 'string', description: 'Fin ISO 8601 (por defecto ahora)' },
      },
      additionalProperties: false,
    },
    async run(db, args) {
      const station = await requireStation(db, args.device_id);
      const { from, to } = resolveWindow(args);
      const [row] = await db`SELECT count(*)::integer AS samples,
          min(temperature_c) AS temp_min, max(temperature_c) AS temp_max, avg(temperature_c) AS temp_avg,
          min(humidity_pct) AS hum_min, max(humidity_pct) AS hum_max, avg(humidity_pct) AS hum_avg,
          min(pressure_pa) AS press_min, max(pressure_pa) AS press_max, avg(pressure_pa) AS press_avg
        FROM measurements
        WHERE device_id = ${station.id} AND is_validated AND deleted_at IS NULL
          AND observed_at >= ${from} AND observed_at < ${to}`;
      return {
        station: { id: station.id, name: station.name },
        from: from.toISOString(),
        to: to.toISOString(),
        samples: row?.samples ?? 0,
        temperature: { min: row?.tempMin ?? null, max: row?.tempMax ?? null, avg: row?.tempAvg ?? null },
        humidity: { min: row?.humMin ?? null, max: row?.humMax ?? null, avg: row?.humAvg ?? null },
        pressure: { min: row?.pressMin ?? null, max: row?.pressMax ?? null, avg: row?.pressAvg ?? null },
      };
    },
  },
  {
    name: 'list_alerts',
    description: 'Avisos de las estaciones con su estado, nivel y origen. Por defecto solo los abiertos.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Por defecto open' },
        device_id: { type: 'string', description: 'Filtrar por estación (opcional)' },
        limit: { type: 'number', description: 'Avisos máximo (1-200; por defecto 50)' },
      },
      additionalProperties: false,
    },
    async run(db, args) {
      const status = ['open', 'closed', 'all'].includes(args.status) ? args.status : 'open';
      const limit = clampInt(args.limit ?? 50, 50, 1, 200);
      let query = db`SELECT a.id::text AS id, a.device_id, d.name AS device_name, a.level, a.message, a.category,
          a.source, a.observed_at, a.created_at, a.acknowledged_at, a.closed_at, a.closure_reason, a.auto_resolved
        FROM alerts a JOIN devices d ON d.id = a.device_id WHERE TRUE`;
      if (status === 'open') query = db`${query} AND a.closed_at IS NULL`;
      if (status === 'closed') query = db`${query} AND a.closed_at IS NOT NULL`;
      if (args.device_id) query = db`${query} AND a.device_id = ${String(args.device_id)}`;
      query = db`${query} ORDER BY a.created_at DESC LIMIT ${limit}`;
      const rows = await query;
      return { status, count: rows.length, alerts: rows };
    },
  },
];

// ---- Protocolo JSON-RPC 2.0 (MCP sin estado) --------------------------------
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// Devuelve { respond:false } para notificaciones, o { status, body, toolName?, ok? }.
export async function handleRpcMessage(message, ctx) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { status: 400, body: rpcError(null, -32600, 'Solicitud JSON-RPC no válida.') };
  }
  const { id, method, params } = message;
  if (typeof method !== 'string') {
    return { status: 200, body: rpcError(id, -32600, 'Falta el método JSON-RPC.') };
  }
  // Las notificaciones no reciben respuesta (202 sin cuerpo).
  if (method.startsWith('notifications/')) return { respond: false };

  if (method === 'initialize') {
    const requested = typeof params?.protocolVersion === 'string' ? params.protocolVersion : LATEST_PROTOCOL_VERSION;
    const version = PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
    return {
      status: 200,
      body: rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Acceso de solo lectura a las microestaciones TECRURAL: estaciones, última medición, histórico, resúmenes y avisos.',
      }),
    };
  }
  if (method === 'ping') return { status: 200, body: rpcResult(id, {}) };
  if (method === 'tools/list') {
    return { status: 200, body: rpcResult(id, {
      tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    }) };
  }
  if (method === 'tools/call') {
    const tool = MCP_TOOLS.find((entry) => entry.name === params?.name);
    if (!tool) {
      return { status: 200, body: rpcError(id, -32602, `Herramienta desconocida: ${String(params?.name)}`) };
    }
    try {
      const data = await tool.run(ctx.sql, params?.arguments ?? {});
      return { status: 200, toolName: tool.name, ok: true, body: rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(data) }],
      }) };
    } catch (error) {
      if (error instanceof McpInputError) {
        return { status: 200, toolName: tool.name, ok: false, body: rpcResult(id, {
          content: [{ type: 'text', text: error.message }], isError: true,
        }) };
      }
      throw error;
    }
  }
  return { status: 200, body: rpcError(id, -32601, `Método no soportado: ${method}`) };
}

// ---- Autenticación -----------------------------------------------------------
// Comparación en tiempo constante para no filtrar el token por tiempos.
export function requireMcpToken(req, res, next) {
  const expected = process.env.MCP_TOKEN || '';
  if (!expected) return res.status(503).json({ error: 'mcp_disabled' });
  const header = req.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const matches = provided.length > 0
    && provided.length === expected.length
    && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!matches) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'mcp_auth_required' });
  }
  return next();
}

const router = Router();
router.use(requireMcpToken);
// MCP no se cachea nunca: las respuestas llevan datos de medición.
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Cliente MCP sin sesiones: solo POST. SSE (GET) y cierre (DELETE) no se ofrecen.
router.get('/', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' }));
router.delete('/', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' }));

async function recordToolCalls(req, calls) {
  for (const call of calls.slice(0, 10)) {
    try {
      await audit(sql, req, 'mcp.tool_call', 'mcp_tool', call.name, null,
        { arguments: call.arguments ?? null, ok: call.ok });
    } catch (error) {
      console.error('No se pudo auditar la llamada MCP:', error.message);
    }
  }
}

router.post('/', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json(rpcError(null, -32600, 'Cuerpo JSON-RPC no válido.'));
  }
  const isBatch = Array.isArray(body);
  const messages = isBatch ? body : [body];
  if (!messages.length) return res.status(400).json(rpcError(null, -32600, 'Lote JSON-RPC vacío.'));

  const responses = [];
  const toolCalls = [];
  try {
    for (const message of messages) {
      const outcome = await handleRpcMessage(message, { sql });
      if (outcome.toolName) {
        toolCalls.push({ name: outcome.toolName, ok: outcome.ok, arguments: message.params?.arguments });
      }
      if (outcome.respond === false) continue;
      if (!isBatch) {
        await recordToolCalls(req, toolCalls);
        return res.status(outcome.status).json(outcome.body);
      }
      responses.push(outcome.body);
    }
    await recordToolCalls(req, toolCalls);
    // Un lote solo con notificaciones se acepta sin contenido.
    if (!responses.length) return res.status(202).end();
    return res.status(200).json(responses);
  } catch (error) {
    console.error('Error MCP:', error);
    return res.status(200).json(rpcError(Array.isArray(body) ? null : body?.id, -32603, 'Error interno del servidor MCP.'));
  }
});

export default router;
