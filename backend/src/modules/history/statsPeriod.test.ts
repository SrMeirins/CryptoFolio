import { describe, expect, it } from 'vitest';
import { chartPeriod, todayIn } from './statsPeriod';

describe('chartPeriod (#376)', () => {
  it('sin fechas: los últimos 18 meses hasta el mes actual', () => {
    expect(chartPeriod({}, '2026-10-22')).toEqual({ granularity: 'month', from: '2025-05-01', to: '2026-10-01' });
  });

  it('con rango: sus meses', () => {
    expect(chartPeriod({ date_from: '2025-03-15', date_to: '2025-06-02' }, '2026-10-22'))
      .toEqual({ granularity: 'month', from: '2025-03-01', to: '2025-06-01' });
  });

  it('solo inicio: hasta hoy; solo final: los 18 meses previos', () => {
    expect(chartPeriod({ date_from: '2026-01-01' }, '2026-10-22')).toEqual({ granularity: 'month', from: '2026-01-01', to: '2026-10-01' });
    expect(chartPeriod({ date_to: '2024-12-31' }, '2026-10-22')).toEqual({ granularity: 'month', from: '2023-07-01', to: '2024-12-01' });
  });

  it('36 meses aún por meses; 37 ya por años', () => {
    expect(chartPeriod({ date_from: '2023-01-01', date_to: '2025-12-31' }, '2026-10-22').granularity).toBe('month');
    expect(chartPeriod({ date_from: '2023-01-01', date_to: '2026-01-31' }, '2026-10-22'))
      .toEqual({ granularity: 'year', from: '2023-01-01', to: '2026-01-01' });
  });

  it('un inicio futuro no deja el final antes del inicio', () => {
    expect(chartPeriod({ date_from: '2027-02-01' }, '2026-10-22')).toEqual({ granularity: 'month', from: '2027-02-01', to: '2027-02-01' });
  });
});

describe('todayIn (#376)', () => {
  it('usa el día local de la zona, no el UTC', () => {
    expect(todayIn('Europe/Madrid', new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-22');
    expect(todayIn('UTC', new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-21');
  });
});

describe('dailyPeriod (#516)', () => {
  it('sin fechas: las 26 semanas (182 días) hasta hoy', () => {
    expect(chartPeriod({}, '2026-11-20', 'dia')).toEqual({ granularity: 'day', from: '2026-05-23', to: '2026-11-20' });
  });
  it('con rango: sus días; sin final, hasta hoy', () => {
    expect(chartPeriod({ date_from: '2026-11-01', date_to: '2026-11-07' }, '2026-11-20', 'dia')).toEqual({ granularity: 'day', from: '2026-11-01', to: '2026-11-07' });
    expect(chartPeriod({ date_from: '2026-11-15' }, '2026-11-20', 'dia')).toEqual({ granularity: 'day', from: '2026-11-15', to: '2026-11-20' });
  });
  it('como mucho 400 días: se recorta el inicio', () => {
    expect(chartPeriod({ date_from: '2020-01-01', date_to: '2026-11-20' }, '2026-11-20', 'dia').from).toBe('2025-10-17');
  });
  it('sin granularidad, como siempre: por meses', () => {
    expect(chartPeriod({}, '2026-11-20').granularity).toBe('month');
  });
});
