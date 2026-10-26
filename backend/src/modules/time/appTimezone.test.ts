import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMEZONE, envTimezone, getTimezoneInfo, invalidateTimezoneCache, isValidTimeZone, resolveTimezone } from './appTimezone';

// Resolución de la zona de la aplicación (#388): ajuste, variable y valor por defecto.
afterEach(() => { invalidateTimezoneCache(); vi.restoreAllMocks(); });

describe('isValidTimeZone', () => {
  it('admite zonas IANA y UTC y rechaza el resto (lista blanca)', () => {
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('Atlantic/Canary')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    for (const bad of ['', 'Marte/Olimpo', "Europe/Madrid'; DROP TABLE transactions; --", 'europe/madrid', 42, null, 'A'.repeat(100)]) {
      expect(isValidTimeZone(bad)).toBe(false);
    }
  });
});

describe('envTimezone', () => {
  it('sin variable devuelve null; con una válida, la zona', () => {
    expect(envTimezone({})).toBeNull();
    expect(envTimezone({ APP_TIMEZONE: ' Atlantic/Canary ' })).toBe('Atlantic/Canary');
  });

  it('una variable inválida lanza con un error claro (el backend no arranca)', () => {
    expect(() => envTimezone({ APP_TIMEZONE: 'Madrid' })).toThrow(/APP_TIMEZONE no es una zona horaria IANA válida/);
  });
});

describe('resolveTimezone', () => {
  it('prioridad: ajuste, variable y valor por defecto', () => {
    expect(resolveTimezone('Atlantic/Canary', { APP_TIMEZONE: 'UTC' })).toEqual({ timezone: 'Atlantic/Canary', source: 'ajuste', invalidSetting: null });
    expect(resolveTimezone(null, { APP_TIMEZONE: 'UTC' })).toEqual({ timezone: 'UTC', source: 'variable', invalidSetting: null });
    expect(resolveTimezone(null, {})).toEqual({ timezone: DEFAULT_TIMEZONE, source: 'defecto', invalidSetting: null });
  });

  it('un ajuste guardado inválido se ignora y se informa', () => {
    expect(resolveTimezone('Marte/Olimpo', {})).toEqual({ timezone: DEFAULT_TIMEZONE, source: 'defecto', invalidSetting: 'Marte/Olimpo' });
    expect(resolveTimezone('Marte/Olimpo', { APP_TIMEZONE: 'UTC' }).timezone).toBe('UTC');
  });
});

describe('getTimezoneInfo', () => {
  it('lee el ajuste una vez, lo reutiliza y avisa de uno inválido', async () => {
    const query = vi.fn(async () => ({ rows: [{ value: 'Marte/Olimpo' }] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await getTimezoneInfo({ query });
    const b = await getTimezoneInfo({ query });
    expect(a).toBe(b);
    expect(query).toHaveBeenCalledTimes(1);
    expect(a.invalidSetting).toBe('Marte/Olimpo');
    expect(warn).toHaveBeenCalledTimes(1);
    invalidateTimezoneCache();
    await getTimezoneInfo({ query });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
