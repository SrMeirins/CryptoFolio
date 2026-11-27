import { createHash } from 'crypto';
import type { Queryable } from '../../backup/backupTables';
import { parseHistorialRetiradas } from './historialRetiradas';

// Registro de las importaciones de retiradas de Binance (#548): una fila de
// csv_imports (tipo 'retiradas') por historial, para que el historial de
// importaciones y la cobertura sepan que existe. No crea operaciones. El hash
// del fichero evita registrarlo dos veces: importar el mismo no cambia nada.

export interface ArchivoRetiradas { filename: string; buffer: Buffer }

export interface ResultadoRegistro { registradas: number; repetidas: number }

const dia = (d: Date): string => d.toISOString().slice(0, 10);

export async function registrarRetiradas(q: Queryable, archivos: readonly ArchivoRetiradas[]): Promise<ResultadoRegistro> {
  let registradas = 0;
  for (const a of archivos) {
    const filas = parseHistorialRetiradas(a.buffer);
    const tiempos = filas.map(f => f.timestamp.getTime());
    const desde = tiempos.length > 0 ? dia(new Date(Math.min(...tiempos))) : null;
    const hasta = tiempos.length > 0 ? dia(new Date(Math.max(...tiempos))) : null;
    const hash = createHash('sha256').update(a.buffer).digest('hex');
    const r = await q.query(
      `INSERT INTO csv_imports (filename, file_hash, row_count, exchange, tipo, periodo_desde, periodo_hasta)
       VALUES ($1, $2, $3, 'binance', 'retiradas', $4, $5)
       ON CONFLICT (file_hash) DO NOTHING`,
      [a.filename, hash, filas.length, desde, hasta],
    );
    registradas += r.rowCount ?? 0;
  }
  return { registradas, repetidas: archivos.length - registradas };
}
