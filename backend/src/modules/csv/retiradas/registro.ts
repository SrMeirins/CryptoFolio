import { createHash } from 'crypto';
import type { Queryable } from '../../backup/backupTables';
import { parseHistorialRetiradas } from './historialRetiradas';

// Registro de las importaciones de retiradas de Binance (#548): una fila de
// csv_imports (tipo 'retiradas') por historial, para que el historial de
// importaciones y la cobertura sepan que existe. No crea operaciones. El hash
// del fichero evita registrarlo dos veces: importar el mismo no cambia nada.

export interface ArchivoRetiradas { filename: string; buffer: Buffer }

export interface ResultadoRegistro { registradas: number; repetidas: number; vacias: number }

const dia = (d: Date): string => d.toISOString().slice(0, 10);

export async function registrarRetiradas(q: Queryable, archivos: readonly ArchivoRetiradas[]): Promise<ResultadoRegistro> {
  let registradas = 0;
  let vacias = 0;
  for (const a of archivos) {
    const filas = parseHistorialRetiradas(a.buffer);
    // Sin retiradas completadas no hay nada que registrar: no cubriría ningún periodo.
    if (filas.length === 0) { vacias++; continue; }
    const tiempos = filas.map(f => f.timestamp.getTime());
    const desde = dia(new Date(tiempos.reduce((a, b) => Math.min(a, b))));
    const hasta = dia(new Date(tiempos.reduce((a, b) => Math.max(a, b))));
    const hash = createHash('sha256').update(a.buffer).digest('hex');
    const r = await q.query(
      `INSERT INTO csv_imports (filename, file_hash, row_count, exchange, tipo, periodo_desde, periodo_hasta)
       VALUES ($1, $2, $3, 'binance', 'retiradas', $4, $5)
       ON CONFLICT (file_hash) DO NOTHING`,
      [a.filename, hash, filas.length, desde, hasta],
    );
    registradas += r.rowCount ?? 0;
  }
  return { registradas, repetidas: archivos.length - registradas - vacias, vacias };
}
