/**
 * Turns a raw POI type coming from the Zaragoza SPARQL endpoint into a
 * short human-readable label.
 *
 * Input examples:
 *   "http://idi.fundacionctic.org/cruzar/turismo#Monumento"
 *     → "Monumento"
 *   "http://.../turismo#Monumento;http://.../turismo#Iglesia"
 *     → "Monumento, Iglesia"
 *   "Restaurante"  (already-clean value)
 *     → "Restaurante"
 *   null / "" / non-string
 *     → "—"
 *
 * Only the first two types are shown to keep the label short.
 */
export function formatPoiType(type) {
  if (!type || typeof type !== 'string') return '—';

  const names = type
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(extractLocalName)
    .filter(Boolean);

  if (names.length === 0) return '—';
  return names.slice(0, 2).join(', ');
}

function extractLocalName(uri) {
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  const local = idx >= 0 ? uri.slice(idx + 1) : uri;
  const trimmed = local.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
