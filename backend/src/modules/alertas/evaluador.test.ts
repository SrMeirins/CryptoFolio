import { describe, expect, it } from 'vitest';
import { crearEvaluador, type AlmacenAlertas, type FuentePrecios } from './evaluador';
import type { Alerta } from './alertasRepo';

// Evaluador de alertas (#519) con precios sintéticos y un almacén en memoria.
function alerta(p: Partial<Alerta>): Alerta {
  return {
    id: 'a1', tipo: 'precio', activo: 'AAA', sentido: 'por_encima', precio: 100, moneda: 'EUR', repeticion: 'una_vez',
    umbral_pct: null, activa: true, armada: true, ultimo_disparo_at: null, ultimo_valor: null, created_at: new Date(), ...p,
  };
}

function montar(alertas: Alerta[], precios: Record<string, number>, hace24: Record<string, number> = {}, cantidades: Record<string, number> = {}) {
  const disparos: Array<[string, number]> = [];
  const rearmes: string[] = [];
  const filas = new Map(alertas.map(a => [a.id, { ...a }]));
  const almacen: AlmacenAlertas = {
    listar: async () => [...filas.values()].map(a => ({ ...a })),
    registrarDisparo: async (id, valor) => {
      const f = filas.get(id)!;
      if (!f.activa || (!f.armada && f.tipo === 'precio')) return false;
      disparos.push([id, valor]);
      f.armada = false;
      if (f.repeticion === 'una_vez' && f.tipo === 'precio') f.activa = false;
      return true;
    },
    rearmar: async id => { rearmes.push(id); filas.get(id)!.armada = true; },
    cantidades: async () => new Map(Object.entries(cantidades)),
  };
  const fuente: FuentePrecios = {
    precio: s => precios[s] ?? null,
    todos: () => new Map(Object.entries(precios)),
    hace24: () => new Map(Object.entries(hace24)),
  };
  return { ev: crearEvaluador(fuente, almacen), disparos, rearmes, precios }
}

describe('evaluador de alertas (#519)', () => {
  it('una alerta «una vez» se dispara una sola vez aunque el precio siga al otro lado', async () => {
    const { ev, disparos, precios } = montar([alerta({})], { AAA: 99 });
    await ev.recargar();
    await ev.alCambiarPrecios(['AAA']);
    expect(disparos).toEqual([]);
    precios.AAA = 101;
    await ev.alCambiarPrecios(['AAA']);
    await ev.alCambiarPrecios(['AAA']);
    precios.AAA = 50; await ev.alCambiarPrecios(['AAA']);
    precios.AAA = 150; await ev.alCambiarPrecios(['AAA']);
    expect(disparos).toEqual([['a1', 101]]);
  });

  it('«cada vez» se rearma al volver al otro lado y vuelve a dispararse', async () => {
    const { ev, disparos, rearmes, precios } = montar([alerta({ repeticion: 'cada_vez' })], { AAA: 105 });
    await ev.recargar();
    await ev.alCambiarPrecios(['AAA']);
    precios.AAA = 99.5; await ev.alCambiarPrecios(['AAA']);
    expect(rearmes).toEqual([]);
    precios.AAA = 98; await ev.alCambiarPrecios(['AAA']);
    precios.AAA = 102; await ev.alCambiarPrecios(['AAA']);
    expect(rearmes).toEqual(['a1']);
    expect(disparos).toEqual([['a1', 105], ['a1', 102]]);
  });

  it('en USD usa el cambio del USDT y reevalúa cuando cambia el USDT', async () => {
    const { ev, disparos, precios } = montar([alerta({ moneda: 'USD', precio: 100 })], { AAA: 90, USDT: 0.95 });
    await ev.recargar();
    await ev.alCambiarPrecios(['AAA']);
    expect(disparos).toEqual([]);
    precios.USDT = 0.9;
    await ev.alCambiarPrecios(['USDT']);
    expect(disparos.map(d => d[0])).toEqual(['a1']);
    expect(disparos[0][1]).toBeCloseTo(100, 9);
  });

  it('las pausadas y las de otros activos no se evalúan', async () => {
    const { ev, disparos } = montar([alerta({ activa: false }), alerta({ id: 'a2', activo: 'BBB' })], { AAA: 500, BBB: 500 });
    await ev.recargar();
    await ev.alCambiarPrecios(['AAA']);
    expect(disparos).toEqual([]);
  });

  it('cartera: cambio del valor en 24 h mayor que el umbral, como mucho una vez al día', async () => {
    const cartera = alerta({ id: 'c1', tipo: 'cartera', activo: null, sentido: null, precio: null, umbral_pct: 5 });
    const { ev, disparos } = montar([cartera], { AAA: 110 }, { AAA: 100 }, { AAA: 2 });
    await ev.recargar();
    const t0 = new Date('2026-11-20T12:00:00Z');
    await ev.revisarCartera(t0);
    await ev.revisarCartera(new Date('2026-11-20T18:00:00Z'));
    expect(disparos).toEqual([['c1', 10]]);
    await ev.revisarCartera(new Date('2026-11-21T12:30:00Z'));
    expect(disparos).toHaveLength(2);
  });
});
