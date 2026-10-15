import { describe, expect, it } from 'vitest'
import { dayMs, formatTick, niceTicks, tickDecimals, tickUnit, timeAxis, timeTicks, type TickUnit } from './chartAxes'

// Ejes del gráfico de evolución (#212).
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const DAY = 86_400_000

/** Simula el eje de un periodo: datos diarios de `days` días hasta `to`. */
function axis(days: number, to = '2026-10-15') {
  const end = dayMs(to)
  const start = end - (days - 1) * DAY
  const unit = tickUnit(days - 1)
  const ticks = timeTicks(start, end, unit)
  return { unit, ticks, labels: ticks.map(t => formatTick(t, unit)), start, end }
}

const gaps = (ticks: number[]) => ticks.slice(1).map((t, i) => t - ticks[i])

describe('eje de fechas', () => {
  it('la unidad depende de la duración: 7D días, 30D lunes, 90D/180D meses, 1A dos meses, Todo trimestres o años', () => {
    expect(axis(7).unit).toBe('day')
    expect(axis(30).unit).toBe('monday')
    expect(axis(90).unit).toBe('month')
    expect(axis(180).unit).toBe('month')
    expect(axis(365).unit).toBe('month2')
    expect(axis(2 * 365).unit).toBe('quarter')
    expect(axis(5 * 365).unit).toBe('year')
  })

  for (const [period, days] of [['7D', 7], ['30D', 30], ['90D', 90], ['180D', 180], ['1A', 365], ['2 años', 730], ['5 años', 1826]] as const) {
    it(`${period}: marcas dentro del rango, sin etiquetas repetidas y alineadas al calendario`, () => {
      const { unit, ticks, labels, start, end } = axis(days)
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      expect(ticks.length).toBeLessThanOrEqual(8)
      expect(ticks.every(t => t >= start && t <= end)).toBe(true)
      expect(new Set(labels).size).toBe(labels.length)
      const dates = ticks.map(iso)
      const rules: Record<TickUnit, (d: string) => boolean> = {
        hour3: () => true,
        day: () => true,
        monday: d => new Date(`${d}T00:00:00Z`).getUTCDay() === 1,
        month: d => d.endsWith('-01'),
        month2: d => d.endsWith('-01') && Number(d.slice(5, 7)) % 2 === 1,
        quarter: d => /-(01|04|07|10)-01$/.test(d),
        year: d => d.endsWith('-01-01'),
      }
      expect(dates.every(rules[unit])).toBe(true)
    })
  }

  it('separación regular: días y lunes exactos, meses de 28 a 31 días', () => {
    expect(new Set(gaps(axis(7).ticks))).toEqual(new Set([DAY]))
    expect(new Set(gaps(axis(30).ticks))).toEqual(new Set([7 * DAY]))
    expect(gaps(axis(180).ticks).every(g => g >= 28 * DAY && g <= 31 * DAY)).toBe(true)
  })

  it('formato según la granularidad', () => {
    expect(formatTick(dayMs('2026-10-12'), 'monday')).toBe('12 oct')
    expect(formatTick(dayMs('2026-09-01'), 'month')).toBe('sept 26')
    expect(formatTick(dayMs('2026-01-01'), 'year')).toBe('2026')
  })

  it('cruza el cambio de año en trimestres y meses alternos', () => {
    expect(timeTicks(dayMs('2025-11-15'), dayMs('2026-08-01'), 'quarter').map(iso)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01'])
    expect(timeTicks(dayMs('2025-10-15'), dayMs('2026-03-01'), 'month2').map(iso)).toEqual(['2025-11-01', '2026-01-01', '2026-03-01'])
  })
})

describe('eje de valores', () => {
  it('valores redondos y equiespaciados que cubren el rango', () => {
    const t = niceTicks(8123, 10950)
    expect(t[0]).toBeLessThanOrEqual(8123)
    expect(t.at(-1)).toBeGreaterThanOrEqual(10950)
    expect(new Set(gaps(t))).toEqual(new Set([1000]))
    expect(t).toEqual([8000, 9000, 10000, 11000])
  })

  it('P&L: incluye siempre el 0 y pasos redondos en %', () => {
    const t = niceTicks(-27.4, -3.1, 4, true)
    expect(t).toContain(0)
    expect(t).toEqual([-30, -20, -10, 0])
    expect(niceTicks(1.2, 4.9, 4, true)).toEqual([0, 2, 4, 6])
  })

  it('rangos pequeños sin decimales flotantes ni etiquetas repetidas', () => {
    const t = niceTicks(0.12, 0.81, 4, true)
    expect(t).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(tickDecimals(t)).toBe(2)
    expect(tickDecimals(niceTicks(0.1, 1.9, 4, true))).toBe(1)
    expect(tickDecimals([0, 0.25, 0.5])).toBe(2)
    expect(tickDecimals([0, 10, 20])).toBe(0)
  })

  it('un valor constante no deja el eje vacío', () => {
    expect(niceTicks(5000, 5000).length).toBeGreaterThanOrEqual(2)
    expect(niceTicks(0, 0, 4, true)).toContain(0)
  })
})

describe('timeAxis', () => {
  it('puntos semanales irregulares: el dominio son las fechas reales y las marcas siguen el calendario', () => {
    const xs = ['2022-02-19', '2022-12-10', '2023-12-02', '2026-10-15'].map(dayMs)
    const a = timeAxis(xs)
    expect(a.domain).toEqual([xs[0], xs[3]])
    expect(a.unit).toBe('year')
    expect(a.ticks.map(iso)).toEqual(['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'])
  })
  it('sin puntos no hay marcas', () => {
    expect(timeAxis([]).ticks).toEqual([])
  })
})

describe('eje horario de 24H (#215)', () => {
  it('cada 3 horas en hora de Madrid, sin repetir y con formato hh:mm', () => {
    const to = Date.UTC(2026, 9, 15, 9, 10)          // 11:10 en Madrid (CEST)
    const a = timeAxis([to - 24 * 3_600_000, to], true)
    expect(a.unit).toBe('hour3')
    const labels = a.ticks.map(t => formatTick(t, 'hour3'))
    expect(labels).toEqual(['12:00', '15:00', '18:00', '21:00', '00:00', '03:00', '06:00', '09:00'])
    expect(new Set(gaps(a.ticks))).toEqual(new Set([3 * 3_600_000]))
  })
  it('el día del cambio de horario sigue marcando horas múltiplos de 3 en Madrid', () => {
    const to = Date.UTC(2026, 9, 25, 12, 0)          // 25 oct: fin del horario de verano
    const labels = timeAxis([to - 24 * 3_600_000, to], true).ticks.map(t => formatTick(t, 'hour3'))
    expect(labels.every(l => Number(l.slice(0, 2)) % 3 === 0 && l.endsWith(':00'))).toBe(true)
  })
})
