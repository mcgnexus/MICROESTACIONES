// Desempaquetado del producto CAP de AEMET.
//
// `/avisos_cap/ultimoelaborado/area/{area}` devuelve un locator JSON cuya URL
// `datos` sirve un **tar** (`application/x-gtar`, opcionalmente gzip) con
// ficheros CAP v1.2 XML — no JSON ni texto suelto. Aquí se detecta el formato
// (gzip → tar → XML), se desempaquetan las entradas y se devuelven los
// documentos XML en texto para que `resolveAemetWarnings` los interprete.
//
// El lector tar es mínimo a propósito (sin dependencias): cabeceras de 512 B,
// tamaño en octal y relleno a múltiplos de 512, con soporte de nombres largos
// GNU ('L'). Los nombres CAP son cortos, pero el formato se defiende.
import { gunzipSync } from 'node:zlib';

const TAR_BLOCK = 512;
const USTAR_MAGIC_OFFSET = 257;

const isGzip = (bytes) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
const isTar = (bytes) => bytes.length > USTAR_MAGIC_OFFSET + 5
  && bytes.toString('utf8', USTAR_MAGIC_OFFSET, USTAR_MAGIC_OFFSET + 5) === 'ustar';

// Extrae las entradas de un tar POSIX/USTAR. Devuelve { name, data: Buffer }.
export function unpackTar(buffer) {
  const bytes = Buffer.from(buffer);
  const entries = [];
  let offset = 0;
  let longName = null;
  while (offset + TAR_BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + TAR_BLOCK);
    // Dos bloques nulos seguidos marcan el final del archivo.
    if (header.every((byte) => byte === 0)) break;
    const type = String.fromCharCode(header[156] || 48);
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/[\0 ]/g, '');
    const size = Number.parseInt(sizeField, 8) || 0;
    const dataStart = offset + TAR_BLOCK;
    const data = bytes.subarray(dataStart, Math.min(dataStart + size, bytes.length));
    offset = dataStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
    if (type === 'L') {
      // GNU long name: el nombre real de la ENTRADA SIGUIENTE viaja en datos.
      longName = data.toString('utf8').replace(/\0.*$/, '');
      continue;
    }
    let name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (longName) { name = longName; longName = null; }
    if (!name) continue;
    if (type === '0' || type === '\0' || type === '') {
      entries.push({ name, data });
    }
  }
  return entries;
}

// Acepta el cuerpo descargado del recurso `datos` y devuelve los documentos
// CAP/XML en texto. Orden de detección: gzip → tar → XML suelto → array JSON.
export function decodeAemetCapBundle(value) {
  let bytes = Buffer.from(value ?? Buffer.alloc(0));
  if (!bytes.length) return [];
  if (isGzip(bytes)) {
    try { bytes = gunzipSync(bytes); } catch { return []; }
  }
  if (isTar(bytes)) {
    return unpackTar(bytes)
      .filter((entry) => /\.xml$/i.test(entry.name))
      .map((entry) => entry.data.toString('utf8'))
      .filter((xml) => xml.trim());
  }
  const text = bytes.toString('utf8');
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) return [text];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
  } catch { /* ni XML ni JSON */ }
  return [];
}
