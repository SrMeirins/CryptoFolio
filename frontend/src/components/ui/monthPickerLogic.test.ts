import { describe, expect, it } from 'vitest'
import { monthGridMove, outOfRange, yearsBetween } from './monthPickerLogic'

// Selector de mes y año (#240).
const min = { year: 2022, month: 2 }
const max = { year: 2026, month: 10 }

describe('MonthPicker', () => {
  it('meses fuera del rango del historial o futuros', () => {
    expect(outOfRange({ year: 2022, month: 1 }, min, max)).toBe(true)
    expect(outOfRange({ year: 2022, month: 2 }, min, max)).toBe(false)
    expect(outOfRange({ year: 2026, month: 10 }, min, max)).toBe(false)
    expect(outOfRange({ year: 2026, month: 11 }, min, max)).toBe(true)
  })
  it('años disponibles', () => {
    expect(yearsBetween(min, max)).toEqual([2022, 2023, 2024, 2025, 2026])
    expect(yearsBetween(max, min)).toEqual([])
  })
  it('flechas por la rejilla de 4 columnas, Inicio y Fin', () => {
    expect(monthGridMove(6, 'ArrowRight')).toBe(7)
    expect(monthGridMove(6, 'ArrowDown')).toBe(10)
    expect(monthGridMove(2, 'ArrowUp')).toBeNull()
    expect(monthGridMove(12, 'ArrowRight')).toBeNull()
    expect(monthGridMove(6, 'Home')).toBe(1)
    expect(monthGridMove(6, 'End')).toBe(12)
    expect(monthGridMove(6, 'Enter')).toBeNull()
  })
})
