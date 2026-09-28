/**
 * Sanitiza un campo de texto antes de escribirlo en un CSV en texto plano
 * exportado desde la app (p. ej. el historial de transacciones) cuando el
 * valor puede provenir de datos importados/introducidos por el usuario sin
 * whitelist (símbolo de activo tomado de un CSV de exchange, nombre de
 * wallet, notas libres...).
 *
 * Duplicado intencionadamente de backend/src/modules/csv/csvSafety.ts:
 * frontend y backend son proyectos TypeScript separados sin código
 * compartido, y el volumen de esta función no justifica crear un paquete
 * compartido solo para esto.
 *
 * Dos protecciones combinadas:
 *
 * 1. CSV Formula Injection (OWASP): si el valor empieza por =, +, -, @, tab
 *    o retorno de carro, Excel/LibreOffice lo interpretan como fórmula al
 *    abrir el CSV aunque el campo sea texto — permitiendo desde fugas de
 *    datos (=WEBSERVICE(...)) hasta ejecución de comandos (=cmd|'/c ...'!A0
 *    en versiones antiguas de Excel con DDE). Mitigación estándar: anteponer
 *    una comilla simple para forzar la interpretación como texto.
 * 2. Delimitador roto (RFC 4180): este export no cita los campos por defecto
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
