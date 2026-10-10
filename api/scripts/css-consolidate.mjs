// F27 · Consolidación de app.css.
//
// El archivo creció por sucesivos ajustes y acumula redefiniciones: el mismo
// selector declarado varias veces y varios @media con la misma consulta. Este
// script lo reescribe aplicando solo transformaciones que no cambian lo que se
// ve en pantalla:
//
//   1. Tokens: valores repetidos (colores, radios, sombras) pasan a variables
//      de :root con el mismo literal. Nada cambia de color ni de tamaño.
//   2. Redefiniciones: un selector declarado varias veces en el mismo contexto
//      (fuera de @media, o dentro de @media con la misma consulta) se funde en
//      su última declaración. Solo si ninguna regla intermedia de igual
//      especificidad declara una propiedad que estaríamos moviendo: ahí el
//      orden sí decide, y entonces se respeta.
//   3. @media: los bloques con la misma consulta se funden en el primero,
//      conservando el orden relativo de sus reglas y sometido a la misma
//      comprobación de especificidad.
//
// Uso:  node scripts/css-consolidate.mjs [--check]
//   --check no escribe: informa de lo que cambiaría y sale con código 1 si el
//           archivo todavía no está consolidado.
import { readFile, writeFile } from 'node:fs/promises';

const CHECK = process.argv.includes('--check');
const CSS_URL = new URL('../public/app.css', import.meta.url);

// --------------------------------------------------------------------------
// Análisis
// --------------------------------------------------------------------------

// Escáner que respeta comentarios y cadenas: los bloques se parten sin romper
// ningún `}` literal dentro de una cadena ni ninguno de comentario.
function scanBlocks(src, from, to) {
  const items = [];
  let i = from;
  let start = from;
  const skipString = (at) => {
    const quote = src[at];
    let j = at + 1;
    while (j < to && src[j] !== quote) {
      if (src[j] === '\\') j += 1;
      j += 1;
    }
    return j + 1;
  };
  const flush = (end) => {
    const text = src.slice(start, end);
    if (text.trim()) items.push({ kind: 'raw', text, start, end });
    start = end;
  };
  while (i < to) {
    const char = src[i];
    if (char === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      i = close < 0 ? to : close + 2;
      continue;
    }
    if (char === '"' || char === "'") { i = skipString(i); continue; }
    if (char === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < to && depth > 0) {
        const ch = src[j];
        if (ch === '/' && src[j + 1] === '*') {
          const close = src.indexOf('*/', j + 2);
          j = close < 0 ? to : close + 2;
          continue;
        }
        if (ch === '"' || ch === "'") { j = skipString(j); continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        j += 1;
      }
      const pending = src.slice(start, i);
      const commentAt = pending.lastIndexOf('*/');
      const selector = pending.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      // El bloque empieza en su selector: lo que hay delante (comentarios de
      // sección, blancos) se conserva aunque el bloque se borre.
      const lead = commentAt >= 0 ? start + commentAt + 2 : start;
      let selectorStart = lead;
      while (selectorStart < i && /\s/.test(src[selectorStart])) selectorStart += 1;
      const bodyStart = i + 1;
      const bodyEnd = j - 1;
      items.push({
        kind: selector.startsWith('@') ? 'atrule' : 'rule',
        selector,
        start: selectorStart,
        end: j,
        bodyStart,
        bodyEnd,
        body: src.slice(bodyStart, bodyEnd),
      });
      start = j;
      i = j;
      continue;
    }
    i += 1;
  }
  flush(to);
  return items;
}

// El selector es el mismo con espacios distintos: `.a, .b` y `.a,.b` cuentan
// como una sola definición redefinida.
function normalizeSelector(selector) {
  return selector
    .replace(/\s+/g, ' ')
    .replace(/\s*([,>+~])\s*/g, '$1')
    .trim();
}

function parseDeclarations(body, offset) {
  const decls = [];
  const re = /(-{0,2}[a-zA-Z-]+)\s*:\s*([^;}]+)/g;
  let match;
  while ((match = re.exec(body))) {
    const value = match[2].trim();
    decls.push({
      prop: match[1],
      value,
      important: /!\s*important\s*$/i.test(value),
      absStart: offset + match.index + match[0].indexOf(match[2]),
      absEnd: offset + match.index + match[0].length,
    });
  }
  return decls;
}

// Especificidad clásica: ids, clases/atributos/pseudo-clases y elementos.
function specificity(selector) {
  const text = selector.replace(/"[^"]*"|'[^']*'/g, '');
  const ids = (text.match(/#[\w-]+/g) || []).length;
  const classes = (text.match(/\.[\w-]+/g) || []).length
    + (text.match(/\[[^\]]*\]/g) || []).length
    + (text.match(/:(?!:)[\w-]+(\([^)]*\))?/g) || []).length;
  const elements = (text.match(/(^|[\s>+~,(])[a-zA-Z][\w-]*/g) || []).length
    + (text.match(/::[\w-]+/g) || []).length;
  return [ids, classes, elements];
}

const sameSpecificity = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Cobertura entre propiedades: `padding` cubre `padding-top`, y por eso un
// shorthand largo no puede mudarse por delante de un longhand posterior.
const SHORTHANDS = new Set([
  'background', 'border', 'border-radius', 'border-color', 'border-width',
  'border-style', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'margin', 'padding', 'font', 'transition', 'animation', 'outline', 'flex',
  'grid', 'inset', 'gap', 'overflow', 'place-items', 'place-content',
  'text-decoration', 'list-style', 'mask', 'columns',
]);

const covers = (broad, narrow) => broad === narrow
  || (SHORTHANDS.has(broad) && narrow.startsWith(`${broad}-`));

// Solo hay conflicto si la regla intermedia escribiría un valor distinto: si
// repite el mismo valor, el orden da igual y mover la declaración es inocuo.
function conflictsWith(contributed, inter) {
  for (const left of contributed) {
    for (const right of inter) {
      if (!covers(left.prop, right.prop) && !covers(right.prop, left.prop)) continue;
      if (left.value !== right.value) return true;
    }
  }
  return false;
}

const declKey = (decls) => decls.map((decl) => `${decl.prop}:${decl.value}`);

function queryKey(selector) {
  const inner = selector.slice(selector.indexOf('(') + 1, selector.lastIndexOf(')'));
  return inner.replace(/\s+/g, '').toLowerCase();
}

// Reglas con su contexto (fuera o dentro de @media con una consulta) y su
// posición, que es la que manda en el cascade.
function collect(src) {
  const top = scanBlocks(src, 0, src.length);
  const rules = [];
  const mediaBlocks = [];
  for (const item of top) {
    if (item.kind === 'rule') {
      rules.push({
        ...item,
        contextKey: 'top',
        decls: parseDeclarations(item.body, item.bodyStart),
      });
    } else if (item.kind === 'atrule' && /^@media/i.test(item.selector)) {
      const key = queryKey(item.selector);
      mediaBlocks.push({ ...item, contextKey: key });
      for (const kid of scanBlocks(src, item.bodyStart, item.bodyEnd)) {
        if (kid.kind !== 'rule') continue;
        rules.push({
          ...kid,
          contextKey: key,
          mediaStart: item.start,
          decls: parseDeclarations(kid.body, kid.bodyStart),
        });
      }
    }
  }
  return { top, rules, mediaBlocks };
}

// --------------------------------------------------------------------------
// 1) Fusionar redefiniciones del mismo selector
// --------------------------------------------------------------------------

function mergeSelectors(src) {
  const { rules } = collect(src);
  const groups = new Map();
  for (const rule of rules) {
    const key = `${rule.contextKey}::${normalizeSelector(rule.selector)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }
  const edits = [];
  const merges = [];
  const skipped = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.start - b.start);
    const target = group[group.length - 1];
    const sources = group.slice(0, -1);
    if (group.some((rule) => rule.decls.some((decl) => decl.important))) {
      skipped.push({ selector: target.selector, why: 'usa !important' });
      continue;
    }
    // Propiedades que aportan las definiciones anteriores y que la última no
    // declara: son las que se mudan al final, en su orden original.
    const claimed = target.decls.map((decl) => decl.prop);
    const contributedDecls = [];
    for (const source of sources) {
      for (const decl of source.decls) {
        if (claimed.some((existing) => covers(existing, decl.prop))) continue;
        claimed.push(decl.prop);
        contributedDecls.push(decl);
      }
    }
    const contributed = contributedDecls.map((decl) => decl.prop);
    if (contributedDecls.length) {
      const first = group[0];
      const spec = specificity(normalizeSelector(target.selector));
      const blocking = rules.filter((rule) => rule.start > first.end && rule.end < target.start
        && sameSpecificity(spec, specificity(normalizeSelector(rule.selector)))
        && conflictsWith(contributedDecls, rule.decls));
      if (blocking.length) {
        skipped.push({
          selector: target.selector,
          why: `manda una regla intermedia de igual especificidad (${normalizeSelector(blocking[0].selector).slice(0, 50)})`,
        });
        continue;
      }
      edits.push({ start: target.bodyStart, end: target.bodyEnd, replacement: mergedBody(target, sources, contributed) });
    }
    for (const source of sources) {
      // Al borrar el bloque se lleva su salto de línea inicial, para que no
      // quede una línea en blanco en su sitio.
      let start = source.start;
      while (start > 0 && (src[start - 1] === ' ' || src[start - 1] === '\t' || src[start - 1] === '\n' || src[start - 1] === '\r')) start -= 1;
      edits.push({ start, end: source.end, replacement: '' });
      merges.push(normalizeSelector(target.selector));
    }
  }
  return { edits, merges, skipped };
}

// Cuerpo resultante: primero las propiedades mudadas (llegan antes en el
// origen) y después las de la definición que manda, respetando la sangría.
function mergedBody(target, sources, contributed) {
  const extra = [];
  for (const source of sources) {
    for (const decl of source.decls) {
      if (contributed.includes(decl.prop) && !extra.some((e) => e.prop === decl.prop)) extra.push(decl);
    }
  }
  const parts = [
    ...extra.map((decl) => `${decl.prop}:${decl.value}`),
    ...target.decls.map((decl) => `${decl.prop}:${decl.value}`),
  ];
  if (!target.body.includes('\n')) return parts.join(';');
  const indent = /\n(\s*)/.exec(target.body)?.[1] ?? '  ';
  return `\n${parts.map((decl) => `${indent}${decl};`).join('\n')}\n`;
}

// --------------------------------------------------------------------------
// 2) Fusionar @media con la misma consulta
// --------------------------------------------------------------------------

function mergeMedia(src) {
  const { rules, mediaBlocks } = collect(src);
  const groups = new Map();
  for (const block of mediaBlocks) {
    if (!groups.has(block.contextKey)) groups.set(block.contextKey, []);
    groups.get(block.contextKey).push(block);
  }
  const edits = [];
  const merges = [];
  const skipped = [];
  for (const [query, blocks] of groups) {
    if (blocks.length < 2) continue;
    blocks.sort((a, b) => a.start - b.start);
    const target = blocks[0];
    const moves = [];
    // Cada bloque posterior se mueve (o se queda) por su cuenta: si uno no es
    // seguro se conserva, y los demás siguen comprobándose contra él porque la
    // ventana de comprobación lo incluye.
    for (const source of blocks.slice(1)) {
      if (src.slice(source.bodyStart, source.bodyEnd).includes('/*')) {
        skipped.push({ query, selector: '(bloque con comentarios)', why: 'se conserva tal cual' });
        continue;
      }
      const children = rules.filter((rule) => rule.mediaStart === source.start);
      const inter = rules.filter((rule) => rule.start > target.end && rule.end < source.start);
      const blocked = children.find((child) => inter.some((rule) => sameSpecificity(
        specificity(normalizeSelector(child.selector)),
        specificity(normalizeSelector(rule.selector)),
      ) && conflictsWith(child.decls, rule.decls)));
      if (blocked) {
        skipped.push({
          query,
          selector: normalizeSelector(blocked.selector),
          why: 'manda una regla intermedia de igual especificidad',
        });
        continue;
      }
      moves.push({ source, children });
    }
    if (!moves.length) continue;
    const additions = [];
    for (const move of moves) {
      for (const child of move.children) additions.push(src.slice(child.start, child.end));
      let start = move.source.start;
      while (start > 0 && (src[start - 1] === ' ' || src[start - 1] === '\t' || src[start - 1] === '\n' || src[start - 1] === '\r')) start -= 1;
      edits.push({ start, end: move.source.end, replacement: '' });
    }
    edits.push({
      start: target.bodyEnd,
      end: target.bodyEnd,
      replacement: additions.map((text) => `\n${text.trim()}`).join(''),
    });
    merges.push({ query, moved: moves.reduce((n, move) => n + move.children.length, 0), blocks: moves.length });
  }
  return { edits, merges, skipped };
}

// --------------------------------------------------------------------------
// 3) Tokens
// --------------------------------------------------------------------------

// Solo valores repetidos y sin ambigüedad: la variable guarda el mismo literal
// y el color, el radio o la sombra que se ve no cambian. Los radios solo se
// sustituyen en declaraciones de radio, y las sombras en box-shadow.
const COLOR_TOKENS = [
  ['--c-muted', '#5f6f64'],
  ['--c-primary', '#1f6241'],
  ['--c-surface', '#fff'],
  ['--c-border', '#e0e6df'],
  ['--c-border-soft', '#edf0ec'],
  ['--c-muted-2', '#5c6a60'],
  ['--c-alert', '#b23c30'],
  ['--c-body', '#22352a'],
  ['--c-ink', '#1e2c24'],
  ['--c-warm', '#fdfaf1'],
  ['--c-danger', '#a13333'],
  ['--c-primary-dark', '#174c32'],
  ['--c-line', '#e3ebe4'],
  ['--c-surface-2', '#f6f8f5'],
  ['--c-brand', '#153b2b'],
];
const RADIUS_TOKENS = [
  ['--r-xl', '14px'],
  ['--r-md', '10px'],
  ['--r-sm', '8px'],
  ['--r-lg', '12px'],
  ['--r-pill', '30px'],
  ['--r-round', '50%'],
];
const SHADOW_TOKENS = [
  ['--shadow-card', '0 5px 20px #17352508'],
];

function tokenize(src) {
  const { rules } = collect(src);
  const colorValues = new Map(COLOR_TOKENS.map(([name, value]) => [value, name]));
  const radiusValues = new Map(RADIUS_TOKENS.map(([name, value]) => [value, name]));
  const shadowValues = new Map(SHADOW_TOKENS.map(([name, value]) => [value, name]));
  const edits = [];
  for (const rule of rules) {
    for (const decl of rule.decls) {
      if (decl.prop.startsWith('--')) continue;
      let name = null;
      if (colorValues.has(decl.value)) name = colorValues.get(decl.value);
      else if (decl.prop === 'border-radius' && radiusValues.has(decl.value)) name = radiusValues.get(decl.value);
      else if (decl.prop === 'box-shadow' && shadowValues.has(decl.value)) name = shadowValues.get(decl.value);
      if (!name) continue;
      edits.push({ start: decl.absStart, end: decl.absEnd, replacement: `var(${name})` });
    }
  }
  return edits;
}

// Las variables se declaran dentro del :root que ya abre el archivo, para no
// añadir un segundo bloque con el mismo selector.
function tokenBlock(src) {
  const declarations = [...COLOR_TOKENS, ...RADIUS_TOKENS, ...SHADOW_TOKENS]
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  const at = src.indexOf(':root{');
  if (at < 0) throw new Error('no se encontró el bloque :root');
  if (src.includes('--c-primary:')) return [];
  return [{ start: at + ':root{'.length, end: at + ':root{'.length, replacement: `${declarations};` }];
}

// --------------------------------------------------------------------------

function applyEdits(src, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) throw new Error(`ediciones solapadas en ${edit.start}`);
    out += src.slice(cursor, edit.start) + edit.replacement;
    cursor = Math.max(cursor, edit.end);
  }
  return out + src.slice(cursor);
}

const original = await readFile(CSS_URL, 'utf8');

const selectorPlan = mergeSelectors(original);
const afterSelectors = applyEdits(original, selectorPlan.edits);
const mediaPlan = mergeMedia(afterSelectors);
const afterMedia = applyEdits(afterSelectors, mediaPlan.edits);
const tokenEdits = [...tokenize(afterMedia), ...tokenBlock(afterMedia)];
const final = applyEdits(afterMedia, tokenEdits);

const report = () => {
  console.log(`redefiniciones fundidas: ${selectorPlan.merges.length} · omitidas: ${selectorPlan.skipped.length}`);
  for (const skip of selectorPlan.skipped) console.log(`  - ${skip.selector.slice(0, 70)} → ${skip.why}`);
  console.log(`@media fundidos: ${mediaPlan.merges.length} · omitidos: ${mediaPlan.skipped.length}`);
  for (const skip of mediaPlan.skipped) console.log(`  - @media ${skip.query} ${skip.selector.slice(0, 50)} → ${skip.why}`);
  console.log(`tokens declarados e intercambiados: ${tokenEdits.length}`);
};

if (CHECK) {
  report();
  if (final !== original) {
    console.log('app.css todavía no está consolidado');
    process.exitCode = 1;
  } else {
    console.log('app.css está consolidado');
  }
} else if (final !== original) {
  await writeFile(CSS_URL, final, 'utf8');
  report();
  console.log('app.css escrito');
} else {
  console.log('app.css ya estaba consolidado');
}
