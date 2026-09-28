/**
 * Sanitiza un campo de texto antes de escribirlo en un CSV en texto plano
 * generado por la app (exports fiscales) cuando el valor puede provenir de
 * datos importados por el usuario (p. ej. el símbolo de un activo tomado tal
 * cual de la columna "Coin" de un CSV de exchange, sin whitelist).
 *
 * Dos protecciones combinadas:
 *
 * 1. CSV Formula Injection (OWASP): si el valor empieza por =, +, -, @, tab
 *    o retorno de carro, Excel/LibreOffice lo interpretan como fórmula al
 *    abrir el CSV aunque el campo sea texto — permitiendo desde fugas de
 *    datos (=WEBSERVICE(...)) hasta ejecución de comandos (=cmd|'/c ...'!A0
 *    en versiones antiguas de Excel con DDE). Mitigación estándar: anteponer
 *    una comilla simple para forzar la interpretación como texto.
 * 2. Delimitador roto (RFC 4180): estos CSV no citan los campos por defecto
 *    (separador ';'), así que un valor con ';', comillas dobles o saltos de
 *    línea desplazaría columnas o filas. Se envuelve entre comillas dobles y
 *    se escapan las comillas internas solo cuando el valor lo necesita.
 */
const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;
const NEEDS_QUOTING_RE = /[;"\n\r]/;

export function sanitizeCsvField(value: string): string {
  let v = value;

  if (FORMULA_TRIGGER_RE.test(v)) {
    v = `'${v}`;
  }

  if (NEEDS_QUOTING_RE.test(v)) {
    v = `"${v.replace(/"/g, '""')}"`;
  }

  return v;
}
