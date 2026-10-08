import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plainDeviceStatus, summarizeFarms, renderFarmOverview, toneLabel,
} from '../public/js/farm-overview.js';

const device = (id, name) => ({ device: { id, name } });

test('plain status translates the station state into advice', () => {
  assert.equal(plainDeviceStatus({ status: { connectivity: 'offline' } }).tone, 'alert');
  assert.equal(plainDeviceStatus({ status: { batteryLevel: 'critical' } }).tone, 'alert');
  assert.match(plainDeviceStatus({ latest: { temperatureC: -2, observedAt: 'x' } }).text, /helada/i);
  assert.match(plainDeviceStatus({ latest: { temperatureC: 39, observedAt: 'x' } }).text, /calor/i);
  assert.equal(plainDeviceStatus({ status: { batteryLevel: 'low' } }).tone, 'warn');
  assert.equal(plainDeviceStatus({ status: { connectivity: 'degraded' } }).tone, 'warn');
  assert.equal(plainDeviceStatus({}).tone, 'muted');
  assert.equal(plainDeviceStatus({ latest: { temperatureC: 18, observedAt: 'x' } }).tone, 'ok');
});

test('a stale frost measurement is not represented as a current risk or normality', () => {
  const state = plainDeviceStatus({
    status: { connectivity: 'online', dataFreshness: 'stale' },
    latest: { temperatureC: -5, observedAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(state.tone, 'warn');
  assert.match(state.text, /antiguas/i);
});

test('summaries group stations by farm and leave the rest apart', () => {
  const farms = [{ id: '1', name: 'El Llano', devices: ['a'] }];
  const devices = [
    { ...device('a', 'Huéscar'), latest: { temperatureC: 18, observedAt: 'x' } },
    { ...device('b', 'Castril'), status: { connectivity: 'offline' } },
  ];
  const { farms: groups, unassigned } = summarizeFarms(farms, devices);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'El Llano');
  assert.equal(groups[0].tone, 'ok');
  assert.equal(groups[0].stations[0].name, 'Huéscar');
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].name, 'Castril');
  assert.equal(unassigned[0].tone, 'alert');
});

test('a farm with no stations is reported as empty and not as a failure', () => {
  const { farms: groups } = summarizeFarms([{ id: '1', name: 'Sin nada', devices: [] }], []);
  assert.equal(groups[0].tone, 'muted');
  const html = renderFarmOverview({ farms: groups, unassigned: [] });
  assert.match(html, /Sin nada/);
  assert.match(html, /no tiene estaciones asociadas/i);
});

test('overview html carries the farm name, the station advice and its tone', () => {
  const { farms: groups, unassigned } = summarizeFarms(
    [{ id: '1', name: 'El Llano', devices: ['a'] }],
    [{ ...device('a', 'Huéscar'), status: { batteryLevel: 'critical' } }],
  );
  const html = renderFarmOverview({ farms: groups, unassigned });
  assert.match(html, /El Llano/);
  assert.match(html, /Requiere atención/);
  assert.match(html, /Batería crítica/);
  assert.equal(toneLabel('ok'), 'Todo en orden');
});
