/**
 * Minimal HTML→plain text sanitizer for values that come from external
 * open-data endpoints (SPARQL, RSS, etc.) with markup we don't want to
 * render literally.
 *
 * - <br> → newline
 * - </p>, </div>, </li>, </hN> → paragraph break (double newline)
 * - Any other tag: stripped
 * - Numeric entities (&#123;, &#x1A;) are decoded to their code point
 * - Named entities from a small ES-oriented table are decoded; unknown
 *   names are left untouched so nothing is silently mangled.
 * - Whitespace is collapsed but paragraph breaks are preserved.
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ',
  uuml: 'ü', Uuml: 'Ü',
  iquest: '¿', iexcl: '¡',
  laquo: '«', raquo: '»',
  ordf: 'ª', ordm: 'º',
  deg: '°', middot: '·',
  mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™',
};

export function stripHtml(input) {
  if (input == null) return '';
  let s = typeof input === 'string' ? input : String(input);

  // Line-breaks first, before we lose the tags.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n\n');

  // Any remaining tag → drop.
  s = s.replace(/<[^>]+>/g, '');

  // Numeric entities.
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = parseInt(n, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    const code = parseInt(h, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });

  // Named entities.
  s = s.replace(/&([a-zA-Z]+);/g, (match, name) =>
    NAMED_ENTITIES[name] ?? match,
  );

  // Whitespace: collapse spaces/tabs, preserve newlines, cap consecutive
  // blank lines at one.
  s = s.replace(/[ \t]+/g, ' ');
  s = s
    .split('\n')
    .map(line => line.trim())
    .join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
