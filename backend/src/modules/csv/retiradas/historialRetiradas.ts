import { parse } from 'csv-parse/sync';
import { direccionValida, txHashValido } from './direccion';

// Historial de retiradas de Binance (#320): export aparte del historial de
// transacciones (Órdenes → Historial de activos → Exportar historial de
// retiradas). No se importa como transacciones: solo aporta la dirección, la
// red y el hash de cada retiro. Módulo puro: sin BD.

export const CABECERAS_RETIRADAS = ['Time', 'Coin', 'Network', 'Amount', 'Fee', 'Address', 'TXID', 'Status'] as const;

export interface RetiradaBinance {
  timestamp: Date;
  coin: string;
  network: string;
  /** Importe recibido + comisión: lo que descuenta el historial de transacciones. */
  bruto: number;
  address: string | null;
  txHash: string | null;
}

function cabeceras(buffer: Buffer): string[] {
  const primera = buffer.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  return primera.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
}

export function esHistorialRetiradas(buffer: Buffer): boolean {
  const cols = new Set(cabeceras(buffer));
  return CABECERAS_RETIRADAS.every(c => cols.has(c));
}

/** Binance exporta en UTC «YYYY-MM-DD HH:MM:SS». */
function fechaUtc(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return null;
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

/** Solo las retiradas completadas: una cancelada o fallida no sale del historial. */
export function parseHistorialRetiradas(buffer: Buffer): RetiradaBinance[] {
  if (!esHistorialRetiradas(buffer)) {
    throw new Error(`El historial de retiradas no tiene las columnas esperadas: ${CABECERAS_RETIRADAS.join(', ')}`);
  }
  const filas: Record<string, string>[] = parse(buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true });
  const out: RetiradaBinance[] = [];
  for (const f of filas) {
    if ((f.Status ?? '').toLowerCase() !== 'completed') continue;
    const timestamp = fechaUtc(f.Time ?? '');
    const amount = parseFloat(f.Amount ?? '');
    const fee = parseFloat(f.Fee ?? '0') || 0;
    if (!timestamp || !Number.isFinite(amount)) continue;
    out.push({
      timestamp,
      coin: (f.Coin ?? '').trim().toUpperCase(),
      network: (f.Network ?? '').trim().toUpperCase(),
      bruto: amount + fee,
      address: direccionValida(f.Address),
      txHash: txHashValido(f.TXID),
    });
  }
  return out;
}
