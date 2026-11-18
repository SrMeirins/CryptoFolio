import type { Currency } from './format'
import type { DiaValorado } from './calendarioDietz'
import { num } from './evolucionReferencia'

// CSV de los días del periodo del panel P&L diario (#512), con el mismo
// formato que el de Evolución (#510): punto y coma, coma decimal, UTF-8 con
// BOM y fecha ISO. Una fila por día con dato; el día en curso se marca.

export function csvPnlDiario(dias: readonly DiaValorado[], currency: Currency): string {
  const cab = ['Fecha', `P&L (${currency})`, 'Rentabilidad del día (%)', `Valor al cierre (${currency})`, `Acumulado (${currency})`, 'Estado']
  let acumulado = 0
  const filas = dias.map(d => {
    acumulado += d.pnl
    return [d.date, num(d.pnl, 2), d.pct === null ? '' : num(d.pct, 4), num(d.value, 2), num(acumulado, 2), d.live ? 'en curso' : 'cerrado'].join(';')
  })
  return '﻿' + [cab.join(';'), ...filas].join('\r\n') + '\r\n'
}
