import { sanitizeCsvField } from '../csv/csvSafety';

// Formato del CSV del Historial (#349): separador ';', punto decimal (como el
// CSV de Fiscal) y fechas ISO 8601 locales con desfase, sin ambigüedad.

export const CSV_BOM = '﻿';

export const HISTORY_CSV_HEADER = [
  'Fecha', 'Tipo', 'Activo', 'Importe', 'Coste', 'Activo coste', 'Precio unitario',
  'Comisión', 'Activo comisión', 'Valor EUR', 'Comisión EUR', 'Valor USD', 'Comisión USD',
  'Origen del valor', 'Wallet', 'Wallet destino', 'Cuenta', 'Manual', 'Editada', 'Notas',
  'ID', 'Archivo de origen', 'Hash', 'Operación asociada',
].join(';');

/** Fila tal como la devuelve historyRowsSql (solo los campos que se exportan). */
export interface HistoryCsvRow {
  id: string;
  timestamp: Date;
  operation_type: string;
  asset: string;
  amount_net: string;
  cost_amount: string | null;
  cost_asset: string | null;
  price_per_unit: string | null;
  fee_amount: string | null;
  fee_asset: string | null;
  value_eur: number | null;
  fee_value_eur: number | null;
  value_source: string;
  usd_per_eur: string | number | null;
  wallet_name: string;
  destination_wallet_name: string | null;
  account: string | null;
  manually_added: boolean;
  /** Importada editada (#378): copia del original o null. */
  original_import: unknown;
  notes: string | null;
  import_filename: string | null;
  tx_hash: string | null;
  /** Compra o venta a la que pertenece una comisión (#371). */
  fee_parent_id: string | null;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** «2026-09-03T17:11:00+02:00»: hora local de `tz` con su desfase en ese instante. */
export function isoLocal(date: Date, tz: string): string {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map(p => [p.type, p.value]));
  // longOffset da «GMT+02:00», o «GMT» a secas en UTC+0.
  const offset = (parts.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** Fecha local AAAA-MM-DD de `tz`. */
export function localDate(date: Date, tz: string): string {
  return isoLocal(date, tz).slice(0, 10);
}

/** NUMERIC de Postgres («601.779800000000000000») sin ceros sobrantes; vacío si es null. */
export function plainNumber(v: string | null): string {
  if (v === null || v === undefined) return '';
  if (!v.includes('.')) return v;
  return v.replace(/0+$/, '').replace(/\.$/, '');
}

/** Importe monetario con dos decimales y punto; vacío si no hay valor. */
export function money(v: number | null): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(2);
}

function toUsd(eur: number | null, rate: string | number | null): number | null {
  const r = rate === null || rate === undefined ? NaN : Number(rate);
  return eur === null || !(r > 0) ? null : eur * r;
}

/**
 * Una línea del CSV. Todo texto libre (activos, wallets, cuenta, notas,
 * archivo, hash) se sanea contra inyección de fórmulas y se cita si hace falta.
 */
export function historyCsvLine(r: HistoryCsvRow, tz: string): string {
  const text = (v: string | null) => sanitizeCsvField(v ?? '');
  return [
    isoLocal(new Date(r.timestamp), tz),
    r.operation_type,
    text(r.asset),
    plainNumber(r.amount_net),
    plainNumber(r.cost_amount),
    text(r.cost_asset),
    plainNumber(r.price_per_unit),
    plainNumber(r.fee_amount),
    text(r.fee_asset),
    money(r.value_eur),
    money(r.fee_value_eur),
    money(toUsd(r.value_eur, r.usd_per_eur)),
    money(toUsd(r.fee_value_eur, r.usd_per_eur)),
    r.value_source,
    text(r.wallet_name),
    text(r.destination_wallet_name),
    text(r.account),
    r.manually_added ? 'Sí' : 'No',
    r.original_import ? 'Sí' : 'No',
    text(r.notes),
    r.id,
    text(r.import_filename),
    text(r.tx_hash),
    r.fee_parent_id ?? '',
  ].join(';');
}

/** historial_<AAAA-MM-DD>[_filtrado].csv: sin ningún dato del usuario en el nombre. */
export function historyCsvFilename(now: Date, tz: string, filtered: boolean): string {
  return `historial_${localDate(now, tz)}${filtered ? '_filtrado' : ''}.csv`;
}
