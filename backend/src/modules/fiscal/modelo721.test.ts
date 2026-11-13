import { describe, expect, it, vi } from 'vitest';
import type { LoteValorizado } from './lotesValoracion';

// El módulo importa la base de datos y la valoración; aquí solo se prueban las funciones puras.
vi.mock('../../db/client', () => ({ db: {} }));
const { agruparPorEntidad, posicionesDe, veredicto721 } = await import('./modelo721');

// Modelo 721 por entidad (#545). Datos sintéticos.
const lote = (p: Partial<LoteValorizado>): LoteValorizado => ({
  asset: 'AAA', wallet_id: 'w1', wallet_name: 'Spot', wallet_kind: 'exchange', wallet_color: '#fff',
  quantity: 1, costBasisEur: 0, precioEur: 0, valorEur: 1000, sinPrecio: false, ...p,
});
const extranjera = { nombre: 'Exchange Sintético Ltd', nif: null, pais: 'MT', web: null }
const espanola = { nombre: 'Exchange Español SL', nif: 'B00000000', pais: 'ES', web: null }

const vig = (entidad: typeof extranjera, filaId = 'f') => ({
  enEspana: entidad.pais === 'ES', entidad, origen: 'usuario' as const, desde: null, filaId, regla: null,
});

describe('agruparPorEntidad', () => {
  const entidades = new Map([['w1', vig(extranjera, 't1')], ['w2', vig(extranjera, 't2')], ['w3', vig(espanola, 't3')]]);
  const grupos = agruparPorEntidad([
    lote({ wallet_id: 'w1', wallet_name: 'Spot', asset: 'AAA', quantity: 1, valorEur: 30_000 }),
    lote({ wallet_id: 'w2', wallet_name: 'Margen', asset: 'AAA', quantity: 2, valorEur: 60_000 }),
    lote({ wallet_id: 'w3', wallet_name: 'Español', valorEur: 5_000 }),
    lote({ wallet_id: 'w4', wallet_name: 'Sin entidad', valorEur: 2_000 }),
    lote({ wallet_id: 'w5', wallet_kind: 'hardware', valorEur: 99_000 }),
  ], entidades);

  it('las subcuentas de una misma entidad suman juntas, por activo', () => {
    const g = grupos.find(x => x.clave === 'entidad:Exchange Sintético Ltd')!;
    expect(g.wallets.map(w => w.nombre)).toEqual(['Margen', 'Spot']);
    // Cada wallet lleva la fila que fija su custodia, para poder quitarla.
    expect(g.wallets.map(w => w.filaId)).toEqual(['t2', 't1']);
    expect(g.activos).toEqual([{ asset: 'AAA', unidades: 3, valorEur: 90_000, sinPrecio: false }]);
    expect(g.totalEur).toBe(90_000);
  });
  it('solo computa lo custodiado fuera de España; sin entidad computa; la autocustodia no aparece', () => {
    expect(grupos.map(g => [g.entidad?.pais ?? 'sin entidad', g.computa])).toEqual([['MT', true], ['sin entidad', true], ['ES', false]]);
    expect(grupos.some(g => g.wallets.some(w => w.id === 'w5'))).toBe(false);
  });
  it('las posiciones a declarar son solo las que computan', () => {
    expect(posicionesDe(grupos).map(p => [p.entidad, p.asset, p.unidades])).toEqual([['Exchange Sintético Ltd', 'AAA', 3], ['Sin entidad', 'AAA', 1]]);
  });
});

describe('veredicto721', () => {
  const g = (valorEur: number, clave = 'entidad:e1', asset = 'AAA') => agruparPorEntidad(
    [lote({ wallet_id: 'w1', asset, valorEur })], new Map([['w1', vig({ ...extranjera, nombre: clave.split(':')[1] })]]))
  it('umbral: justo en 50.000 € no obliga; un céntimo más, sí', () => {
    expect(veredicto721(g(50_000), 50_000, null, false)).toMatchObject({ obligado: false, motivo: 'no_supera' })
    expect(veredicto721(g(50_000.01), 50_000, null, false)).toMatchObject({ obligado: true, motivo: 'umbral' })
  })
  it('incremento: tras presentar 60.000 €, solo obliga por encima de 80.000 €', () => {
    const ultima = { valor: 60_000 }
    expect(veredicto721(g(80_000), 50_000, ultima, false)).toMatchObject({ obligado: false, motivo: 'incremento_insuficiente', objetivoIncremento: 80_000 })
    expect(veredicto721(g(80_000.01), 50_000, ultima, false)).toMatchObject({ obligado: true, motivo: 'incremento' })
    expect(veredicto721(g(55_000), 50_000, ultima, false).obligado).toBe(false)
  })
  it('extinción: una moneda declarada que ya no tienes obliga aunque no se supere nada', () => {
    const ultima = { valor: 60_000, posiciones: [{ clave: 'entidad:e1', entidad: 'Exchange Sintético Ltd', asset: 'BBB', unidades: 5, valorEur: 60_000 }] }
    expect(veredicto721(g(1_000), 50_000, ultima, false)).toMatchObject({
      obligado: true, motivo: 'extincion', extinguidas: [{ entidad: 'Exchange Sintético Ltd', asset: 'BBB' }],
    })
    // Si la sigue teniendo, no hay extinción.
    expect(veredicto721(g(1_000, 'entidad:e1', 'BBB'), 50_000, ultima, false).extinguidas).toEqual([])
  })
  it('con precios pendientes, lo que no supera queda sin determinar', () => {
    expect(veredicto721(g(40_000), 50_000, null, true).obligado).toBeNull()
    expect(veredicto721(g(60_000), 50_000, null, true).obligado).toBe(true)
  })
})
