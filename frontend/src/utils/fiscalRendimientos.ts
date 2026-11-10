import type { RendimientoEvent } from '../pages/fiscal/types'
import { sanitizeCsvField } from './csvSafety'

// CSV de los rendimientos filtrados (#313): mismas columnas que la tabla,
// separador «;» y textos saneados contra inyección de fórmulas.
const num = (n: number, d: number) => (Number.isFinite(n) ? n.toFixed(d).replace(/\.?0+$/, '') || '0' : '')

export function buildRendimientosCsv(rows: readonly RendimientoEvent[]): string {
  const header = ['Fecha', 'Tipo', 'Activo', 'Cantidad', 'Valor (EUR)', 'Wallet'].join(';')
  const lines = rows.map(r => [
    r.fecha, sanitizeCsvField(r.tipo), sanitizeCsvField(r.activo), num(r.cantidad, 12), r.valorEur.toFixed(2), sanitizeCsvField(r.wallet),
  ].join(';'))
  return [header, ...lines].join('\n')
}
