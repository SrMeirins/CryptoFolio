import { describe, expect, it } from 'vitest'
import { csvPnlDiario } from './pnlPeriodoCsv'

describe('csvPnlDiario (#512)', () => {
  it('BOM, punto y coma, coma decimal, fecha ISO, acumulado y estado', () => {
    const csv = csvPnlDiario([
      { date: '2026-11-17', pnl: 10.5, pct: 1.25, value: 850, inflow: 0, outflow: 0, complete: true, live: false },
      { date: '2026-11-18', pnl: -2.25, pct: null, value: 847.75, inflow: 0, outflow: 0, complete: false, live: true },
    ], 'EUR')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [cab, f1, f2] = csv.slice(1).split('\r\n')
    expect(cab).toBe('Fecha;P&L (EUR);Rentabilidad del día (%);Valor al cierre (EUR);Acumulado (EUR);Estado')
    expect(f1).toBe('2026-11-17;10,50;1,2500;850,00;10,50;cerrado')
    expect(f2).toBe('2026-11-18;-2,25;;847,75;8,25;en curso')
  })
})
