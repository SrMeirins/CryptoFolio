export function abs(n: number): number {
  return Math.abs(n);
}

// Binance exporta con año de 4 dígitos (2021-02-19). Versiones antiguas
// usaban 2 (21-02-19). Antes duplicado idéntico en parser.ts, validator.ts
// e importerPreview.ts — cada uno con su propia copia de la misma regex.
export function normalizeBinanceYear(raw: string): string {
  return /^\d{4}-/.test(raw) ? raw : '20' + raw;
}

// Parseo de línea CSV consciente de comillas (separador dentro de un campo
// entrecomillado no corta la celda). Antes duplicado carácter por carácter
// entre validator.ts y bitvavoValidator.ts.
export function parseCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

// Fiat real — depósitos/retiros de estas monedas no tienen lote FIFO.
// Ámbito: parsing de CSV de exchange (qué cuenta como fiat al interpretar una
// fila), compartido por los parsers de Binance y Bitvavo — NO confundir con
// el FIAT_ASSETS de modules/fiscal/contrapartida.ts (ámbito distinto: qué es
// legal tender para Hacienda). Mismo nombre, propósito distinto; no fusionar
// ambas listas.
export const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF']);

// Operaciones de compra EUR→cripto con patrón de 2 filas (gasto + ingreso)
// cuyos timestamps pueden no coincidir exactamente — preprocessor.ts las
// enlaza por remark y unifica el timestamp ANTES de agrupar;
// interpreters/trades.ts las interpreta DESPUÉS de agrupar. Antes, cada
// fichero mantenía su propia copia idéntica de este mismo set bajo un
// nombre distinto (REMARK_LINKED_OPS / FIAT_BUY_OPS) sin relacionarlas.
export const FIAT_BUY_OPS = new Set([
  'Buy Crypto With Fiat',
  'Buy Crypto With Card',
  'Convert Fiat to Crypto OCBS',
]);
