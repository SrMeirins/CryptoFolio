import { describe, expect, it } from 'vitest';
import { avisosAlertas } from './avisos';
import { fingerprint } from '../notifications/preferences';
import type { Alerta } from './alertasRepo';

// Avisos de alertas disparadas (#519), con datos sintéticos.
const base: Alerta = {
  id: 'a1', tipo: 'precio', activo: 'AAA', sentido: 'por_encima', precio: 1.5, moneda: 'EUR', repeticion: 'una_vez',
  umbral_pct: null, activa: false, armada: false, ultimo_disparo_at: new Date('2026-11-20T12:05:00Z'), ultimo_valor: 1.52, created_at: new Date(),
};

describe('avisosAlertas', () => {
  it('un aviso por alerta disparada, en la categoría Alertas y con la hora de la app', () => {
    const [n] = avisosAlertas([base], 'Europe/Madrid');
    expect(n).toMatchObject({ id: 'alerta-a1', category: 'Alertas', type: 'info' });
    expect(n.message).toBe('AAA ha subido por encima de 1,50 € (1,52 €) el 20 nov a las 13:05.');
  });
  it('las que no se han disparado no avisan', () => {
    expect(avisosAlertas([{ ...base, ultimo_disparo_at: null, ultimo_valor: null }], 'Europe/Madrid')).toEqual([]);
  });
  it('cartera: sube o baja con su %; una bajada es una advertencia', () => {
    const c = { ...base, id: 'c1', tipo: 'cartera' as const, activo: null, sentido: null, precio: null, umbral_pct: 5, ultimo_valor: -6.25 };
    const [n] = avisosAlertas([c], 'Europe/Madrid');
    expect(n).toMatchObject({ type: 'warning' });
    expect(n.message).toContain('ha bajado un 6,3 % en 24 h');
  });
  it('un disparo nuevo cambia la huella: vuelve a salir aunque se descartara el anterior', () => {
    const [n1] = avisosAlertas([base], 'Europe/Madrid');
    const [n2] = avisosAlertas([{ ...base, ultimo_disparo_at: new Date('2026-11-21T09:00:00Z') }], 'Europe/Madrid');
    expect(fingerprint(n1)).not.toBe(fingerprint(n2));
  });
});
