import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// F27 · El CSS no vuelve a acumular redefiniciones ni valores sueltos.
//
// La consolidación vive en scripts/css-consolidate.mjs y solo aplica cambios
// que no alteran lo que se ve. Aquí se comprueba que el archivo sigue en ese
// estado: si alguien añade una regla redefinida o un color repetido, la prueba
// falla y la salida dice qué ejecutar para consolidarlo.

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

test('app.css está consolidado (sin redefiniciones ni valores sueltos)', async () => {
  try {
    const { stdout } = await run(process.execPath, ['scripts/css-consolidate.mjs', '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.match(stdout, /app\.css está consolidado/);
  } catch (error) {
    assert.fail([
      'app.css acumula redefiniciones o valores sin token.',
      'Ejecuta: node scripts/css-consolidate.mjs',
      error.stdout || error.message,
    ].join('\n'));
  }
});
