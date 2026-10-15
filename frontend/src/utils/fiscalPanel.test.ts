import { describe, expect, it } from 'vitest'
import { deadlineUrgency, estimatedTax, gainLossShares, nextFiscalDeadline } from './fiscalPanel'
import { calcularTramos } from './tramosIrpf'

// Panel fiscal del Dashboard (#236).
const NO = { previous: false, current: false }
const CUR = { previous: false, current: true }
const PREV = { previous: true, current: false }
describe('nextFiscalDeadline', () => {
  it('antes del 30 de junio: el plazo de la renta del año anterior', () => {
    expect(nextFiscalDeadline('2026-05-01', NO)).toMatchObject({ label: 'Renta 2025', date: '2026-06-30', days: 60 })
  })
  it('después: el 721 del año siguiente si hay obligación; si no, la renta del año en curso', () => {
    expect(nextFiscalDeadline('2026-10-15', CUR)).toMatchObject({ label: 'Modelo 721 de 2026', date: '2027-03-31', days: 167 })
    expect(nextFiscalDeadline('2026-10-15', NO)).toMatchObject({ label: 'Renta 2026', date: '2027-06-30', days: 258 })
  })
  it('el propio día del plazo cuenta como 0 días', () => {
    expect(nextFiscalDeadline('2026-06-30', NO).days).toBe(0)
  })

  // #249: apertura, estado y progreso.
  it('antes de la campaña: pendiente de abrir, con los días hasta la apertura estimada', () => {
    const d = nextFiscalDeadline('2026-10-15', NO)
    expect(d).toMatchObject({ status: 'pending', opens: '2027-04-08', opensApprox: true, daysToOpen: 175, progress: 0 })
  })
  it('el día de apertura ya está abierta, al 0 %', () => {
    expect(nextFiscalDeadline('2026-04-08', NO)).toMatchObject({ status: 'open', daysToOpen: 0, progress: 0 })
  })
  it('con la campaña abierta, progreso entre apertura y cierre; el día del cierre, al 100 %', () => {
    expect(nextFiscalDeadline('2026-05-19', NO).progress).toBeCloseTo((41 / 83) * 100, 6)
    expect(nextFiscalDeadline('2026-06-30', NO)).toMatchObject({ status: 'open', progress: 100 })
  })
  it('el día siguiente al cierre pasa al plazo siguiente, pendiente', () => {
    expect(nextFiscalDeadline('2026-07-01', NO)).toMatchObject({ label: 'Renta 2026', status: 'pending' })
  })
  it('Modelo 721: abre el 1 de enero (fecha fija)', () => {
    expect(nextFiscalDeadline('2026-12-31', CUR)).toMatchObject({ label: 'Modelo 721 de 2026', status: 'pending', daysToOpen: 1 })
    expect(nextFiscalDeadline('2027-01-01', PREV)).toMatchObject({ label: 'Modelo 721 de 2026', status: 'open', opensApprox: false, days: 89 })
  })
  it('entre enero y marzo vence el 721 del año anterior, si hubo obligación', () => {
    expect(nextFiscalDeadline('2027-02-15', PREV).label).toBe('Modelo 721 de 2026')
    expect(nextFiscalDeadline('2027-02-15', NO).label).toBe('Renta 2026')
    expect(nextFiscalDeadline('2027-04-01', PREV).label).toBe('Renta 2026')   // el 721 ya cerró
  })
})

describe('deadlineUrgency', () => {
  it('tranquilo si falta más de un mes o no ha abierto; pronto hasta 30 días; urgente la última semana', () => {
    expect(deadlineUrgency(nextFiscalDeadline('2026-05-01', NO))).toBe('calm')    // 60 días
    expect(deadlineUrgency(nextFiscalDeadline('2026-06-10', NO))).toBe('soon')    // 20 días
    expect(deadlineUrgency(nextFiscalDeadline('2026-06-25', NO))).toBe('urgent')  // 5 días
    expect(deadlineUrgency(nextFiscalDeadline('2026-10-15', NO))).toBe('calm')    // pendiente
  })
})

describe('estimatedTax', () => {
  it('suma la cuota de los tramos del ahorro; sin base positiva, 0', () => {
    const base = 10_000
    expect(estimatedTax(base)).toBeCloseTo(calcularTramos(base).reduce((s, t) => s + t.cuota, 0), 2)
    expect(estimatedTax(0)).toBe(0)
    expect(estimatedTax(-500)).toBe(0)
  })
})

describe('gainLossShares', () => {
  it('reparte en % el valor absoluto de ganancias y pérdidas', () => {
    expect(gainLossShares(30, -10)).toEqual({ gains: 75, losses: 25 })
    expect(gainLossShares(0, 0)).toEqual({ gains: 0, losses: 0 })
  })
})
