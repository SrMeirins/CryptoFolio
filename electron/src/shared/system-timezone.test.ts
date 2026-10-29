import { describe, expect, it } from 'vitest';
import { systemTimezoneEnv } from './system-timezone';

describe('systemTimezoneEnv (#388)', () => {
  it('pasa la zona del sistema si es conocida', () => {
    expect(systemTimezoneEnv({}, 'Atlantic/Canary')).toEqual({ APP_TIMEZONE: 'Atlantic/Canary' });
  });

  it('respeta una APP_TIMEZONE ya definida', () => {
    expect(systemTimezoneEnv({ APP_TIMEZONE: 'UTC' }, 'Atlantic/Canary')).toEqual({});
  });

  it('una zona desconocida o ausente no se pasa (el backend usa la de por defecto)', () => {
    expect(systemTimezoneEnv({}, 'Marte/Olimpo')).toEqual({});
    expect(systemTimezoneEnv({}, undefined)).toEqual({});
  });
});
