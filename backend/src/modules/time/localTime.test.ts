import { describe, expect, it } from 'vitest';
import { clampDay, endOfLocalYear, localDate, localYearMonth, startOfLocalDay } from './localTime';

// Fechas locales en varias zonas (#295, #388), con cambios de hora.
const MAD = 'Europe/Madrid';
const CAN = 'Atlantic/Canary';

describe('localYearMonth', () => {
  it('el cambio de año y de mes sigue la hora local de la zona', () => {
    expect(localYearMonth(MAD, new Date('2024-12-31T22:59:59Z'))).toEqual({ year: 2024, month: 12 });
    expect(localYearMonth(MAD, new Date('2024-12-31T23:00:00Z'))).toEqual({ year: 2025, month: 1 });
    expect(localYearMonth(MAD, new Date('2024-06-30T22:00:00Z'))).toEqual({ year: 2024, month: 7 }); // verano, UTC+2
    // 00:30 peninsular del 1 de enero (23:30Z) aún es 2024 en Canarias.
    expect(localYearMonth(CAN, new Date('2024-12-31T23:30:00Z'))).toEqual({ year: 2024, month: 12 });
    expect(localYearMonth('UTC', new Date('2024-12-31T23:30:00Z'))).toEqual({ year: 2024, month: 12 });
  });
});

describe('endOfLocalYear', () => {
  it('es el último milisegundo del 31 de diciembre en la zona', () => {
    expect(endOfLocalYear(MAD, 2024).toISOString()).toBe('2024-12-31T22:59:59.999Z');
    expect(endOfLocalYear(CAN, 2024).toISOString()).toBe('2024-12-31T23:59:59.999Z');
    expect(endOfLocalYear('UTC', 2024).toISOString()).toBe('2024-12-31T23:59:59.999Z');
    expect(endOfLocalYear('America/New_York', 2024).toISOString()).toBe('2025-01-01T04:59:59.999Z');
    for (const tz of [MAD, CAN, 'Asia/Tokyo']) {
      const end = endOfLocalYear(tz, 2024);
      expect(localYearMonth(tz, end).year).toBe(2024);
      expect(localYearMonth(tz, new Date(end.getTime() + 1)).year).toBe(2025);
    }
  });
});

describe('startOfLocalDay', () => {
  it('la medianoche local, también en los días de cambio de hora', () => {
    expect(startOfLocalDay(MAD, 2026, 3, 29).toISOString()).toBe('2026-03-28T23:00:00.000Z'); // pasa a verano ese día
    expect(startOfLocalDay(MAD, 2026, 3, 30).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(startOfLocalDay(MAD, 2026, 10, 26).toISOString()).toBe('2026-10-25T23:00:00.000Z'); // tras volver a invierno
  });
});

describe('localDate', () => {
  it('el día local de la zona, no el de UTC', () => {
    expect(localDate(MAD, new Date('2024-12-31T23:30:00Z'))).toBe('2025-01-01');
    expect(localDate(CAN, new Date('2024-12-31T23:30:00Z'))).toBe('2024-12-31');
    expect(localDate(MAD, new Date('2024-06-30T22:00:00Z'))).toBe('2024-07-01');
  });
});

describe('clampDay', () => {
  it('ajusta al último día del mes', () => {
    expect(clampDay(2025, 2, 29)).toBe(28);
    expect(clampDay(2024, 2, 29)).toBe(29);
  });
});
