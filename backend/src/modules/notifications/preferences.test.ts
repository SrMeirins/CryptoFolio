import { describe, expect, it } from 'vitest';
import { categoryKey, dismissWith, fingerprint, mutedSchema, parsePrefs, visibleNotifications } from './preferences';
import type { SystemNotification } from './collect';

// Preferencias de los avisos (#447). Datos sintéticos.
const n = (id: string, category: string, message: string, count?: number): SystemNotification => ({ id, type: 'warning', category, message, count });
const precios = n('no-price', 'Precios', '2 activos sin precio: SINTA, SINTB.', 2);
const fiscal = n('fiscal-calendar', 'Fiscal', 'Quedan 7 días para el Modelo 721.');

describe('preferencias de avisos', () => {
  it('la huella cambia con el mensaje o el recuento, no con el tipo', () => {
    expect(fingerprint(precios)).toBe(fingerprint({ ...precios }));
    expect(fingerprint(precios)).not.toBe(fingerprint({ ...precios, count: 3 }));
    expect(fingerprint(precios)).not.toBe(fingerprint({ ...precios, message: 'otro' }));
    expect(fingerprint(precios)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('un aviso descartado se oculta hasta que cambia su contenido', () => {
    const prefs = parsePrefs(undefined, JSON.stringify(dismissWith({}, [precios])));
    expect(visibleNotifications([precios, fiscal], prefs)).toEqual([fiscal]);
    const empeora = { ...precios, message: '3 activos sin precio: SINTA, SINTB, SINTC.', count: 3 };
    expect(visibleNotifications([empeora, fiscal], prefs)).toEqual([empeora, fiscal]);
  });

  it('una categoría silenciada oculta todos sus avisos', () => {
    const prefs = parsePrefs('["fiscal"]', undefined);
    expect(visibleNotifications([precios, fiscal], prefs)).toEqual([precios]);
  });

  it('los descartes solo guardan avisos que siguen existiendo', () => {
    const viejo = { 'ya-no-existe': 'abc' };
    expect(Object.keys(dismissWith(viejo, [precios], [precios, fiscal]))).toEqual(['no-price']);
  });

  it('valores dañados cuentan como vacíos', () => {
    const prefs = parsePrefs('no es json', '{"no-price": 5}');
    expect(prefs.muted.size).toBe(0);
    expect(prefs.dismissed).toEqual({});
    expect(parsePrefs(undefined, '[1,2]').dismissed).toEqual({});
  });

  it('solo se silencian categorías conocidas, sin repetir', () => {
    expect(mutedSchema.safeParse('["precios","fiscal"]').success).toBe(true);
    expect(mutedSchema.safeParse('[]').success).toBe(true);
    for (const raw of ['["otra"]', '["fiscal","fiscal"]', '"fiscal"', 'x', '{}']) expect(mutedSchema.safeParse(raw).success).toBe(false);
    expect(categoryKey('Depósitos')).toBe('depositos');
    expect(categoryKey('Desconocida')).toBeNull();
  });
});
