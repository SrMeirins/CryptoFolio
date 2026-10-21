import type { PreviewResult, DepositReview } from './importerPreview';
import type { Exchange } from './exchanges';
import type { ValidationResult } from './validator';

// Lote de varios archivos (#326): combina las vistas previas de cada archivo en
// una sola revisión. Módulo puro (sin BD): los tipos se importan solo como tipos.

export type EstadoArchivo = 'listo' | 'no_reconocido' | 'sin_novedades';

export interface DeteccionArchivo { exchange: Exchange | null; idioma: string; reconocido: boolean }

export interface VistaArchivo {
  nombre: string;
  exchange: Exchange;
  deteccion: DeteccionArchivo;
  resultado: PreviewResult;
}

export interface ArchivoLote {
  indice: number;
  nombre: string;
  exchange: Exchange;
  reconocido: boolean;
  estado: EstadoArchivo;
  /** Motivo legible si no está listo. */
  motivo: string | null;
  nuevas: number;
  /** Ya importadas en la BD. */
  duplicadas: number;
  /** Repetidas en un archivo anterior del mismo lote (exportaciones solapadas). */
  repetidasEnLote: number;
  rango: { from: string; to: string } | null;
}

export type PreviewLote = PreviewResult & {
  archivos: ArchivoLote[];
  repetidasEnLote: number;
  transactions: Array<PreviewResult['transactions'][number] & { archivo: number }>;
};

/**
 * Une las vistas previas en el orden recibido. Una transacción nueva cuyas filas
 * ya aparecieron en un archivo anterior del lote deja de ser nueva: se revisa e
 * importa una sola vez. Los depósitos a revisar se unen sin repetir.
 */
export function combinarVistasPrevias(vistas: readonly VistaArchivo[]): PreviewLote {
  const vistos = new Set<string>();
  const archivos: ArchivoLote[] = [];
  const transactions: PreviewLote['transactions'] = [];
  const depositos = new Map<string, DepositReview>();
  const unknownOperationSamples: PreviewResult['unknownOperationSamples'] = {};
  const varios = vistas.length > 1;
  const conNombre = (nombre: string, m: string) => (varios ? `${nombre}: ${m}` : m);
  const validation: ValidationResult = {
    valid: false, errors: [], warnings: [], info: [], detectedColumns: [], detectedLanguage: 'unknown',
    unknownOperations: [], rowCount: 0, dateRange: null,
  };
  let retiradas: PreviewResult['retiradas'] = null;
  const errors: string[] = [];

  vistas.forEach((v, indice) => {
    const r = v.resultado;
    let nuevas = 0;
    let repetidas = 0;
    // Solo cuentan las filas de archivos ANTERIORES: dentro de un mismo archivo varias
    // transacciones pueden compartir fila (p. ej. una compra y su comisión en Binance).
    const delArchivo = new Set<string>();
    for (const tx of r.transactions) {
      let isNew = tx.isNew;
      if (isNew && tx.rawRowHashes.some(h => vistos.has(h))) { isNew = false; repetidas++; }
      if (isNew) nuevas++;
      tx.rawRowHashes.forEach(h => delArchivo.add(h));
      transactions.push({ ...tx, isNew, archivo: indice });
    }
    delArchivo.forEach(h => vistos.add(h));

    const reconocido = r.validation.valid;
    const estado: EstadoArchivo = !reconocido ? 'no_reconocido' : nuevas === 0 ? 'sin_novedades' : 'listo';
    archivos.push({
      indice, nombre: v.nombre, exchange: v.exchange, reconocido: v.deteccion.reconocido, estado,
      motivo: !reconocido
        ? (v.deteccion.reconocido ? `No se puede leer como ${v.exchange === 'binance' ? 'Binance' : 'Bitvavo'}` : 'Formato no reconocido')
        : nuevas === 0
          ? (r.transactions.length === 0 ? 'No contiene transacciones que importar'
            : repetidas > 0 ? 'Todo está en otro archivo del lote o ya importado' : 'Ya importado, nada nuevo')
          : null,
      nuevas, duplicadas: r.duplicateCount, repetidasEnLote: repetidas, rango: r.validation.dateRange,
    });

    if (!reconocido) { validation.errors.push(...r.validation.errors.map(e => conNombre(v.nombre, e))); return; }
    validation.valid = true;
    validation.rowCount += r.validation.rowCount;
    validation.warnings.push(...r.validation.warnings.map(w => conNombre(v.nombre, w)));
    validation.info.push(...r.validation.info.map(i => conNombre(v.nombre, i)));
    for (const op of r.validation.unknownOperations) if (!validation.unknownOperations.includes(op)) validation.unknownOperations.push(op);
    if (validation.detectedLanguage === 'unknown') validation.detectedLanguage = r.validation.detectedLanguage;
    const rango = r.validation.dateRange;
    if (rango) {
      validation.dateRange = validation.dateRange
        ? { from: rango.from < validation.dateRange.from ? rango.from : validation.dateRange.from, to: rango.to > validation.dateRange.to ? rango.to : validation.dateRange.to }
        : { ...rango };
    }
    Object.assign(unknownOperationSamples, r.unknownOperationSamples);
    for (const d of r.depositReviews) if (!depositos.has(d.txKey)) depositos.set(d.txKey, d);
    errors.push(...r.errors.map(e => conNombre(v.nombre, e)));
    if (r.retiradas) {
      retiradas = retiradas
        ? { filas: r.retiradas.filas, emparejadas: retiradas.emparejadas + r.retiradas.emparejadas, retiros: retiradas.retiros + r.retiradas.retiros }
        : { ...r.retiradas };
    }
  });

  const newCount = archivos.reduce((s, a) => s + a.nuevas, 0);
  return {
    validation,
    transactions,
    duplicateCount: archivos.reduce((s, a) => s + a.duplicadas, 0),
    newCount,
    errors,
    unknownOperationSamples,
    depositReviews: [...depositos.values()],
    retiradas,
    archivos,
    repetidasEnLote: archivos.reduce((s, a) => s + a.repetidasEnLote, 0),
  };
}
