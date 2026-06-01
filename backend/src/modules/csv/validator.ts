import {
  CANONICAL_COLUMNS,
  detectLanguage,
  normalizeHeaders,
  languageLabel,
  SupportedLanguage,
} from './languages';
import { ALL_KNOWN_OPERATIONS } from './binanceAccounts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedColumns: string[];
  detectedLanguage: SupportedLanguage;
  unknownOperations: string[];
  rowCount: number;
  dateRange: { from: string; to: string } | null;
}

export function validateCsvStructure(fileBuffer: Buffer): ValidationResult {
  const result: ValidationResult = {
    valid: false,
    errors: [],
    warnings: [],
    detectedColumns: [],
    detectedLanguage: 'unknown',
    unknownOperations: [],
    rowCount: 0,
    dateRange: null,
  };

  // 1. Leer contenido y strip BOM
  const content = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    result.errors.push('El archivo está vacío o solo tiene cabeceras');
    return result;
  }

  // 2. Detectar separador
  const header = lines[0];
  const separator = header.includes(';') ? ';' : ',';

  // 3. Extraer columnas raw
  const rawColumns = header
    .split(separator)
    .map((c) => c.trim().replace(/^"|"$/g, ''));

  result.detectedColumns = rawColumns;

  // 4. Detectar idioma
  const lang = detectLanguage(rawColumns);
  result.detectedLanguage = lang;

  if (lang === 'unknown') {
    result.errors.push(
      'No se pudo detectar el idioma del CSV. ' +
      'Las cabeceras no coinciden con ningún formato conocido de Binance. ' +
      'Idiomas soportados: Inglés, Español.'
    );
    result.errors.push(
      'Cabeceras detectadas: ' + rawColumns.join(', ')
    );
    return result;
  }

  // 5. Normalizar cabeceras al inglés canónico
  const normalizedColumns = normalizeHeaders(rawColumns, lang);

  // 6. Verificar columnas canónicas
  for (const required of CANONICAL_COLUMNS) {
    if (!normalizedColumns.includes(required)) {
      result.errors.push(`Columna requerida no encontrada: "${required}"`);
    }
  }

  if (result.errors.length > 0) {
    result.errors.unshift(
      `CSV detectado en ${languageLabel(lang)} pero faltan columnas requeridas.`
    );
    return result;
  }

  // 7. Analizar filas con columnas normalizadas
  const colIndex = {
    time:      normalizedColumns.indexOf('Time'),
    operation: normalizedColumns.indexOf('Operation'),
    coin:      normalizedColumns.indexOf('Coin'),
    change:    normalizedColumns.indexOf('Change'),
  };

  const unknownOps = new Set<string>();
  const dates: Date[] = [];
  let validRows = 0;
  let malformedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCsvLine(line, separator);

    if (cells.length < normalizedColumns.length) {
      malformedRows++;
      continue;
    }

    const operation = cells[colIndex.operation]?.trim();
    const timeStr   = cells[colIndex.time]?.trim();
    const changeStr = cells[colIndex.change]?.trim();

    if (operation && !ALL_KNOWN_OPERATIONS.has(operation)) {
      unknownOps.add(operation);
    }

    if (timeStr) {
      try {
        const d = new Date('20' + timeStr.replace(' ', 'T') + 'Z');
        if (!isNaN(d.getTime())) dates.push(d);
      } catch { /* ignorar */ }
    }

    if (changeStr && isNaN(parseFloat(changeStr))) {
      malformedRows++;
      continue;
    }

    validRows++;
  }

  result.rowCount = validRows;
  result.unknownOperations = [...unknownOps];

  // 8. Rango de fechas
  if (dates.length > 0) {
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    result.dateRange = {
      from: sorted[0].toISOString().slice(0, 10),
      to:   sorted[sorted.length - 1].toISOString().slice(0, 10),
    };
  }

  // 9. Warnings
  if (lang !== 'en') {
    result.warnings.push(
      `CSV detectado en ${languageLabel(lang)} — cabeceras normalizadas automáticamente al inglés.`
    );
  }

  if (malformedRows > 0) {
    result.warnings.push(`${malformedRows} filas con formato incorrecto serán ignoradas`);
  }

  if (unknownOps.size > 0) {
    result.warnings.push(
      `Operaciones desconocidas detectadas: ${[...unknownOps].join(', ')}. ` +
      `Requerirán revisión manual.`
    );
  }

  if (validRows === 0) {
    result.errors.push('No se encontraron filas válidas en el archivo');
    return result;
  }

  result.valid = result.errors.length === 0;
  return result;
}

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
