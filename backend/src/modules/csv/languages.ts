// ── Sistema de soporte multiidioma para cabeceras CSV de Binance ──────────
//
// Para añadir un nuevo idioma:
// 1. Añadir la clave al tipo SupportedLanguage
// 2. Añadir el mapa de columnas en COLUMN_MAPS
// El resto del sistema (parser, validator, importer) no necesita cambios.

export type SupportedLanguage = 'en' | 'es' | 'unknown';

// Columnas canónicas (inglés) — fuente de verdad interna
export const CANONICAL_COLUMNS = [
  'User ID',
  'Time',
  'Account',
  'Operation',
  'Coin',
  'Change',
  'Remark',
] as const;

export type CanonicalColumn = typeof CANONICAL_COLUMNS[number];

// Mapa por idioma: columna local → columna canónica
const COLUMN_MAPS: Record<Exclude<SupportedLanguage, 'unknown'>, Record<string, CanonicalColumn>> = {
  en: {
    'User ID':   'User ID',
    'Time':      'Time',
    'Account':   'Account',
    'Operation': 'Operation',
    'Coin':      'Coin',
    'Change':    'Change',
    'Remark':    'Remark',
  },
  es: {
    'ID de usuario': 'User ID',
    'Tiempo':        'Time',
    'Cuenta':        'Account',
    'Operación':     'Operation',
    'Moneda':        'Coin',
    'Cambio':        'Change',
    'Observación':   'Remark',
  },
};

// ── Detección de idioma por porcentaje de coincidencia ────────────────────
// Si ≥5 de 7 columnas coinciden con un idioma → ese es el idioma detectado
const DETECTION_THRESHOLD = 5;

export function detectLanguage(headers: string[]): SupportedLanguage {
  const normalizedHeaders = headers.map((h) => h.trim());

  let bestLang: SupportedLanguage = 'unknown';
  let bestScore = 0;

  for (const [lang, map] of Object.entries(COLUMN_MAPS)) {
    const knownColumns = Object.keys(map);
    const score = normalizedHeaders.filter((h) => knownColumns.includes(h)).length;

    if (score > bestScore) {
      bestScore = score;
      bestLang = lang as SupportedLanguage;
    }
  }

  return bestScore >= DETECTION_THRESHOLD ? bestLang : 'unknown';
}

// ── Normalización de cabeceras al inglés canónico ────────────────────────
export function normalizeHeaders(
  headers: string[],
  lang: SupportedLanguage
): string[] {
  if (lang === 'unknown' || lang === 'en') return headers;

  const map = COLUMN_MAPS[lang];
  return headers.map((h) => {
    const trimmed = h.trim();
    return map[trimmed] ?? trimmed; // Si no está en el mapa, lo dejamos tal cual
  });
}

// ── Nombre legible del idioma para logs/UI ────────────────────────────────
export function languageLabel(lang: SupportedLanguage): string {
  const labels: Record<SupportedLanguage, string> = {
    en: 'Inglés',
    es: 'Español',
    unknown: 'Desconocido',
  };
  return labels[lang];
}
