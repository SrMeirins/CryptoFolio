import { describe, expect, it } from 'vitest';
import { endOfYearMadrid, madridDate, madridYearMonth } from './madridTime';

// Ejercicio fiscal en hora de Madrid (#295).
describe('madridYearMonth', () => {
  it('el cambio de año y de mes sigue la hora de Madrid', () => {
    expect(madridYearMonth(new Date('2024-12-31T22:59:59Z'))).toEqual({ year: 2024, month: 12 });
    expect(madridYearMonth(new Date('2024-12-31T23:00:00Z'))).toEqual({ year: 2025, month: 1 });
    expect(madridYearMonth(new Date('2024-06-30T22:00:00Z'))).toEqual({ year: 2024, month: 7 }); // verano, UTC+2
  });
});

describe('endOfYearMadrid', () => {
  it('es el último milisegundo del 31 de diciembre en Madrid', () => {
    const end = endOfYearMadrid(2024);
    expect(end.toISOString()).toBe('2024-12-31T22:59:59.999Z');
    expect(madridYearMonth(end).year).toBe(2024);
    expect(madridYearMonth(new Date(end.getTime() + 1)).year).toBe(2025);
  });
});

describe('madridDate', () => {
  it('el día local de Madrid, no el de UTC', () => {
    expect(madridDate(new Date('2024-12-31T23:30:00Z'))).toBe('2025-01-01');
    expect(madridDate(new Date('2024-06-30T21:59:00Z'))).toBe('2024-06-30');
    expect(madridDate(new Date('2024-06-30T22:00:00Z'))).toBe('2024-07-01');
  });
});
