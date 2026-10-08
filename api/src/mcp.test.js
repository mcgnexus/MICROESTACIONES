import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRpcMessage, requireMcpToken, MCP_TOOLS } from './mcp.js';

// Cliente sql falso: responde por coincidencia de subcadenas del SQL emitido,
// igual que el doble de pipeline.test.js. Devuelve arrays como el cliente real.
function makeDb(routes = []) {
  const calls = [];
  const db = (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    for (const route of routes) {
      if (text.includes(route.match)) return Promise.resolve(typeof route.rows === 'function' ? route.rows({ text, values }) : route.rows);
    }
    return Promise.resolve([]);
  };
  db.calls = calls;
  return db;
}

// ---- Autenticación -----------------------------------------------------------
function runToken(headers = {}, token) {
  const previous = process.env.MCP_TOKEN;
  if (token === undefined) delete process.env.MCP_TOKEN;
  else process.env.MCP_TOKEN = token;
  try {
    const req = { get: (name) => headers[name.toLowerCase()] };
    const res = {
      statusCode: null,
      body: null,
      headers: {},
      set(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    let nextCalled = false;
    requireMcpToken(req, res, () => { nextCalled = true; });
    return { nextCalled, statusCode: res.statusCode, headers: res.headers, body: res.body };
  } finally {
    if (previous === undefined) delete process.env.MCP_TOKEN;
    else process.env.MCP_TOKEN = previous;
  }
}

test('mcp stays disabled without a configured token', () => {
  const result = runToken({}, undefined);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { error: 'mcp_disabled' });
});

test('mcp rejects missing or wrong bearer tokens without timing leaks', () => {
  for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: 'basic abc' }]) {
    const result = runToken(headers, 'secreto-largo-123');
    assert.equal(result.nextCalled, false, JSON.stringify(headers));
    assert.equal(result.statusCode, 401);
    assert.equal(result.headers['WWW-Authenticate'], 'Bearer');
  }
});

test('mcp accepts the exact bearer token', () => {
  const result = runToken({ authorization: 'Bearer secreto-largo-123' }, 'secreto-largo-123');
  assert.equal(result.nextCalled, true);
});

// ---- Protocolo ----------------------------------------------------------------
test('initialize negotiates a supported protocol version and presents the server', async () => {
  const echoed = await handleRpcMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, {});
  assert.equal(echoed.status, 200);
  assert.equal(echoed.body.result.protocolVersion, '2025-03-26');
  assert.equal(echoed.body.result.serverInfo.name, 'tecrural-mcp');
  assert.ok(echoed.body.result.capabilities.tools);

  const fallback = await handleRpcMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, {});
  assert.equal(fallback.body.result.protocolVersion, '2025-06-18');
});

test('notifications get no response body', async () => {
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, {});
  assert.equal(outcome.respond, false);
});

test('tools/list exposes the read-only catalogue with JSON schemas', async () => {
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, {});
  const names = outcome.body.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ['list_stations', 'get_station_latest', 'get_station_history', 'get_station_summary', 'list_alerts']);
  for (const tool of outcome.body.result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 10);
  }
  for (const tool of MCP_TOOLS.filter((entry) => ['get_station_latest', 'get_station_history', 'get_station_summary'].includes(entry.name))) {
    assert.deepEqual(tool.inputSchema.required, ['device_id']);
  }
  assert.ok(!MCP_TOOLS.find((entry) => entry.name === 'list_alerts').inputSchema.required);
});

test('tools/call rejects unknown tools as invalid params', async () => {
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_everything' } }, {});
  assert.equal(outcome.body.error.code, -32602);
});

test('unsupported methods answer method not found', async () => {
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', id: 5, method: 'resources/list' }, {});
  assert.equal(outcome.body.error.code, -32601);
});

// ---- Herramientas con base de datos falsa -------------------------------------
const STATION_ROUTE = {
  match: 'FROM devices d',
  rows: [{ id: 'esp32c3-01', name: 'Huéscar', lastValidData: '2026-10-08T09:00:00Z', config: { sync_interval_s: 1800, interval_normal_s: 300 } }],
};
const LATEST_ROUTE = {
  match: 'FROM measurements',
  rows: [{ observedAt: '2026-10-08T09:00:00Z', temperatureC: 18.4, humidityPct: 55, pressurePa: 91200, batteryMv: 3900, lux: 1200 }],
};

test('get_station_latest returns the validated reading with freshness', async () => {
  const db = makeDb([STATION_ROUTE, LATEST_ROUTE]);
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_station_latest', arguments: { device_id: 'esp32c3-01' } } }, { sql: db });
  assert.equal(outcome.ok, true);
  const payload = JSON.parse(outcome.body.result.content[0].text);
  assert.equal(payload.station.id, 'esp32c3-01');
  assert.equal(payload.latest.temperatureC, 18.4);
  assert.equal(payload.dataFreshness, 'stale');
});

test('get_station_latest reports unknown stations as a tool error, not a crash', async () => {
  const db = makeDb([]);
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_station_latest', arguments: { device_id: 'fantasma' } } }, { sql: db });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.body.result.isError, true);
  assert.match(outcome.body.result.content[0].text, /desconocida/);
});

test('get_station_history clamps the limit and validates the window', async () => {
  const db = makeDb([STATION_ROUTE, { match: 'FROM measurements', rows: [] }]);
  const ok = await handleRpcMessage({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'get_station_history', arguments: { device_id: 'esp32c3-01', limit: 99999 } } }, { sql: db });
  assert.equal(ok.ok, true);
  const limitCall = db.calls.find((call) => call.text.includes('LIMIT ?'));
  assert.equal(limitCall.values.at(-1), 500);

  const bad = await handleRpcMessage({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'get_station_history', arguments: { device_id: 'esp32c3-01', from: '2026-01-02T00:00:00Z', to: '2026-01-01T00:00:00Z' } } }, { sql: db });
  assert.equal(bad.body.result.isError, true);
  assert.match(bad.body.result.content[0].text, /rango/);
});

test('list_alerts defaults to open alerts and filters by station', async () => {
  const db = makeDb([{ match: 'ORDER BY a.created_at DESC', rows: [{ id: '1', device_id: 'esp32c3-01', device_name: 'Huéscar', level: 1, message: 'Helada', closedAt: null }] }]);
  const outcome = await handleRpcMessage({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_alerts', arguments: { device_id: 'esp32c3-01' } } }, { sql: db });
  assert.equal(outcome.ok, true);
  const payload = JSON.parse(outcome.body.result.content[0].text);
  assert.equal(payload.status, 'open');
  assert.equal(payload.count, 1);
  // La consulta final encadena fragmentos: el límite viaja como parámetro y el
  // filtro de estación aparece en alguna de las llamadas encadenadas.
  const emitted = db.calls.at(-1);
  assert.ok(emitted.text.includes('ORDER BY a.created_at DESC'));
  assert.equal(emitted.values.at(-1), 50);
  assert.ok(db.calls.some((call) => call.values.includes('esp32c3-01')));
  assert.ok(db.calls.some((call) => call.text.includes('a.closed_at IS NULL')));
});

test('malformed messages answer with a JSON-RPC protocol error', async () => {
  for (const message of [null, 'texto', 42, { jsonrpc: '2.0', id: 11 }]) {
    const outcome = await handleRpcMessage(message, {});
    assert.equal(outcome.body.error.code, -32600, JSON.stringify(message));
  }
});
