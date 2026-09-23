import { ValidationResult } from './validator';

const REQUIRED_COLUMNS = [
  'Timezone', 'Date', 'Time', 'Type', 'Currency', 'Amount',
  'Quote Currency', 'Quote Price', 'Received / Paid Currency', 'Received / Paid Amount',
  'Fee currency', 'Fee amount', 'Status', 'Transaction ID', 'Address',
];

const KNOWN_TYPES = new Set(['buy', 'deposit', 'withdrawal', 'rebate']);

function parseCsvLine(line: string, separator: string): string[] {
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

export function validateBitvavoCsvStructure(fileBuffer: Buffer): ValidationResult {
  const result: ValidationResult = {
    valid: false,
    errors: [],
    warnings: [],
    info: [],
    detectedColumns: [],
    detectedLanguage: 'en',
    unknownOperations: [],
    rowCount: 0,
    dateRange: null,
  };

  const content = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    result.errors.push('El archivo está vacío o solo tiene cabeceras');
    return result;
  }

  const header = lines[0];
  const separator = header.includes(';') ? ';' : ',';
  const columns = header.split(separator).map((c) => c.trim().replace(/^"|"$/g, ''));
  result.detectedColumns = columns;

  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) {
      result.errors.push(`Columna requerida no encontrada: "${required}" — ¿es un CSV de Bitvavo?`);
    }
  }
  if (result.errors.length > 0) return result;

  const colIndex = {
    date:   columns.indexOf('Date'),
    time:   columns.indexOf('Time'),
    tz:     columns.indexOf('Timezone'),
    type:   columns.indexOf('Type'),
    amount: columns.indexOf('Amount'),
  };

  const unknownTypes = new Set<string>();
  const dates: Date[] = [];
  let validRows = 0;
  let malformedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCsvLine(line, separator);
    if (cells.length < columns.length) { malformedRows++; continue; }

    const type = cells[colIndex.type]?.trim().toLowerCase();
    if (type && !KNOWN_TYPES.has(type)) unknownTypes.add(type);

    const amountStr = cells[colIndex.amount]?.trim();
    if (amountStr && isNaN(parseFloat(amountStr))) { malformedRows++; continue; }

    const dateStr = cells[colIndex.date]?.trim();
    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00Z');
      if (!isNaN(d.getTime())) dates.push(d);
    }

    validRows++;
  }

  result.rowCount = validRows;
  result.unknownOperations = [...unknownTypes];

  if (dates.length > 0) {
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    result.dateRange = {
      from: sorted[0].toISOString().slice(0, 10),
      to:   sorted[sorted.length - 1].toISOString().slice(0, 10),
    };
  }

  if (malformedRows > 0) {
    result.warnings.push(`${malformedRows} filas con formato incorrecto serán ignoradas`);
  }
  if (unknownTypes.size > 0) {
    result.errors.push(
      `Tipo(s) de operación Bitvavo no reconocido(s): ${[...unknownTypes].join(', ')}. ` +
      `Requieren verificación manual antes de importar — contacta para añadir soporte.`
    );
  }
  if (validRows === 0) {
    result.errors.push('No se encontraron filas válidas en el archivo');
    return result;
  }

  result.valid = result.errors.length === 0;
  return result;
}
