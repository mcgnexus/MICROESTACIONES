import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { unpackTar, decodeAemetCapBundle } from './aemet-cap.js';
import { resolveAemetWarnings, resolveAemetWarningsDetailed } from './weather.js';

// Construye un tar USTAR mínimo a partir de entradas { name, data: Buffer }.
function buildTar(entries) {
  const blocks = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    header.write(entry.name, 0, 100, 'utf8');
    // El tamaño va en OCTAL (11 dígitos + NUL), como espera el formato.
    header.write(entry.data.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    const padding = Buffer.alloc((512 - (entry.data.length % 512)) % 512, 0);
    blocks.push(header, Buffer.concat([entry.data, padding]));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

const XML_A = '<alert><identifier>a-1</identifier><status>Actual</status><msgType>Alert</msgType></alert>';
const XML_B = '<alert><identifier>b-1</identifier><status>Actual</status><msgType>Alert</msgType></alert>';

test('unpackTar reads USTAR entries and stops at the zero blocks', () => {
  const tar = buildTar([
    { name: 'Z_CAP_a.xml', data: Buffer.from(XML_A, 'utf8') },
    { name: 'Z_CAP_b.xml', data: Buffer.from(XML_B, 'utf8') },
  ]);
  const entries = unpackTar(tar);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'Z_CAP_a.xml');
  assert.equal(entries[0].data.toString('utf8'), XML_A);
  assert.equal(entries[1].name, 'Z_CAP_b.xml');
});

test('decodeAemetCapBundle unpacks gzipped tars and keeps only the CAP XML entries', () => {
  const tar = buildTar([
    { name: 'Z_CAP_a.xml', data: Buffer.from(XML_A, 'utf8') },
    { name: 'LEEME.txt', data: Buffer.from('no es xml', 'utf8') },
    { name: 'Z_CAP_b.xml', data: Buffer.from(XML_B, 'utf8') },
  ]);
  const gzipped = gzipSync(tar);
  const docs = decodeAemetCapBundle(gzipped);
  assert.equal(docs.length, 2);
  assert.match(docs[0], /a-1/);
  assert.match(docs[1], /b-1/);
});

test('decodeAemetCapBundle tolerates raw XML, JSON arrays and empty or broken payloads', () => {
  assert.deepEqual(decodeAemetCapBundle(Buffer.from(XML_A, 'utf8')), [XML_A]);
  assert.deepEqual(decodeAemetCapBundle(Buffer.from('["<alert>x</alert>"]', 'utf8')), ['<alert>x</alert>']);
  assert.deepEqual(decodeAemetCapBundle(Buffer.alloc(0)), []);
  // Bytes que dicen gzip pero están corruptos: sin documentos, sin excepción.
  assert.deepEqual(decodeAemetCapBundle(Buffer.from([0x1f, 0x8b, 0x00, 0x01])), []);
  assert.deepEqual(decodeAemetCapBundle(Buffer.from('gateway caído', 'utf8')), []);
});

// Fixture REAL: tar capturado de /avisos_cap/ultimoelaborado/area/61 (Andalucía),
// recortado a dos entradas reales: un aviso amarillo de zona 610404 (ajena) y un
// boletín de nivel verde que incluye las zonas 611802/611803 (Huéscar). Los dos
// boletines no se solapan en el tiempo, así que cada aserción usa su ventana.
test('a real Andalucía CAP bundle parses and filters by warning zone', async () => {
  const fixture = await readFile(new URL('./fixtures/aemet-avisos-61-sample.tar.gz', import.meta.url));
  const docs = decodeAemetCapBundle(fixture);
  assert.equal(docs.length, 2);
  assert.ok(docs.every((doc) => /<(?:\w+:)?alert\b/i.test(doc)), 'cada entrada es CAP XML');
  // Ventana del amarillo (válido hasta 2026-10-09T03:59Z): la zona 610404 lo
  // recupera y la zona de Huéscar (611802) no. Sin coordenadas, el geocódigo
  // de zona declara la pertenencia. El CAP trae <info> por idioma (es/en):
  // se prefiere el texto en español.
  const duringAmarillo = new Date('2026-10-08T22:30:00Z');
  const amarillo = resolveAemetWarnings(docs, { now: duringAmarillo, areaCode: '610404' });
  assert.ok(amarillo.length >= 1, 'el aviso amarillo sale dentro de su ventana');
  assert.ok(amarillo.every((warning) => /lluvias/i.test(warning.event || '')), 'texto en español preferido');
  assert.equal(resolveAemetWarnings(docs, { now: duringAmarillo, areaCode: '611802' }).length, 0, 'la zona de Huéscar no recibe el aviso de otra provincia');
  // Ventana del boletín verde (desde 2026-10-10T22:00Z): Minor/verde es la
  // AUSENCIA declarada de aviso → se descarta por completo (ni vigente ni
  // próximo); la zona queda sin avisos y sin falsos positivos.
  const duringVerde = new Date('2026-10-11T08:00:00Z');
  const detailed = resolveAemetWarningsDetailed(docs, { now: duringVerde, areaCode: '611802' });
  assert.equal(detailed.active.length, 0, 'Minor/verde no cuenta como aviso vigente');
  assert.equal(detailed.upcoming.length, 0, 'Minor/verde tampoco se conserva como próximo');
});
