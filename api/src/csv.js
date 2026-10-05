const FORMULA_PREFIX = /^[\u0000-\u0020\uFEFF]*[=+\-@]/;

// Quoting protects CSV structure; the apostrophe additionally prevents
// spreadsheet applications from evaluating untrusted text as a formula.
export function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
