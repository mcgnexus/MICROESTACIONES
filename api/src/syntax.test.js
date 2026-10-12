import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { transform } from 'esbuild';

// Las suites de este proyecto leen el código como texto (regex + cliente falso),
// así que un error de sintaxis en un módulo del servidor no rompía ninguna
// prueba y solo aparecía al desplegar. Esta prueba parsea cada módulo para
// cubrir ese hueco.

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const apiDir = fileURLToPath(new URL('../api/', import.meta.url));

async function jsFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await jsFiles(path));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

test('todos los módulos del servidor tienen sintaxis válida', async () => {
  const files = [...await jsFiles(srcDir), ...await jsFiles(apiDir)];
  assert.ok(files.length > 0, 'debe haber módulos que revisar');
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    try {
      await transform(source, { loader: 'js', format: 'esm' });
    } catch (error) {
      assert.fail(`${file.replace(/\\/g, '/')}: ${error.message}`);
    }
  }
});
