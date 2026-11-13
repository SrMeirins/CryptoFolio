import { describe, expect, it } from 'vitest';
import { construirExport, fechaEs } from './datosExport';
import type { EventoFiscal, Rendimiento } from '../eventosAnio';

// Datos de exportación (#547). Eventos sintéticos; tipos por defecto.
const TIPOS = [19, 21, 23, 27, 30];
const ev = (p: Partial<EventoFiscal>): EventoFiscal => ({
  fecha: '2025-03-01', fechaHora: '2025-03-01T10:00:00Z', tipo: 'Venta', activoTransmitido: 'AAA', activoRecibido: null,
  cantidadTransmitida: 1, contrapartidaClave: 'F', contrapartidaDescripcion: 'Euros', contrapartidaRevisar: false,
  valorTransmisionEur: 100, gastosTransmisionEur: 1, valorAdquisicionEur: 50, gastosAdquisicionEur: 0, gananciaPerdidaEur: 49,
  wallet: 'Uno', txId: 't1', fechaAdquisicion: '2024-01-01', eventId: 'e1', comisionCompraEur: 0, esConvert: false, valoracion: null,
  valorEntregadoEur: null, valorRecibidoEur: null, canal: 'orden', permutaWrapStaking: false, lostSinMotivo: false, posiblePerdidaDiferida: false,
  ...p,
});
const rend = (p: Partial<Rendimiento>): Rendimiento => ({
  fecha: '2025-05-01', fechaHora: '2025-05-01T00:00:00Z', tipo: 'Staking', activo: 'BBB', cantidad: 2, valorEur: 30, wallet: 'Uno',
  base: 'ahorro', txId: 'r1', operacion: 'STAKING_REWARD', ...p,
} as Rendimiento);

describe('construirExport', () => {
  // t1 consume dos lotes, uno en ganancia y otro en pérdida; t2 es otra venta.
  const eventos = [
    ev({ eventId: 'e1', txId: 't1', gananciaPerdidaEur: 49 }),
    ev({ eventId: 'e2', txId: 't1', gananciaPerdidaEur: -9, valorAdquisicionEur: 109, fechaAdquisicion: '2024-06-01' }),
    ev({ eventId: 'e3', txId: 't2', activoTransmitido: 'CCC', gananciaPerdidaEur: -20, canal: 'convert', contrapartidaRevisar: true }),
  ];
  const datos = construirExport({
    year: 2025, eventos, tipos: TIPOS,
    rendimientos: [rend({}), rend({ base: 'general', tipo: 'Airdrop', valorEur: 10 })],
    anios: [{ year: 2024, netoGP: -100, rendimientos: 0 }, { year: 2025, netoGP: 20, rendimientos: 30 }],
  });

  it('una fila por operación, sumando sus lotes; el detalle por lote aparte', () => {
    expect(datos.operaciones).toHaveLength(2);
    expect(datos.operaciones[0]).toMatchObject({ activo: 'AAA', cantidad: 2, lotes: 2, resultado: 40, valorAdquisicion: 159, canal: 'Orden' });
    expect(datos.operaciones[1]).toMatchObject({ activo: 'CCC', canal: 'Convert', revisar: true });
    expect(datos.lotes.map(l => [l.fechaAdquisicion, l.resultado])).toEqual([['2024-01-01', 49], ['2024-06-01', -9], ['2024-01-01', -20]]);
  });

  it('ganancias y pérdidas por lote, como la pantalla, y el neto igual a la suma', () => {
    expect(datos.resumen).toMatchObject({ ganancias: 49, perdidas: -29, neto: 20, operaciones: 2, rendimientos: 2 });
    expect(datos.activos[0]).toMatchObject({ activo: 'AAA', operaciones: 1, ganancias: 49, perdidas: -9, neto: 40 });
    expect(datos.resumen).toMatchObject({ rendimientosAhorro: 30, rendimientosGeneral: 10 });
  });

  it('compensa la pérdida de 2024 y calcula la cuota con la base resultante', () => {
    expect(datos.compensacion).toEqual([{ anio: 2024, original: 100, aplicadaEnEjercicio: expect.any(Number), pendiente: expect.any(Number), caducaEn: 2028 }]);
    const c = datos.compensacion[0];
    expect(c.aplicadaEnEjercicio + c.pendiente).toBeCloseTo(100, 2);
    expect(datos.resumen.cuota).toBeCloseTo(datos.resumen.baseAhorro * 0.19, 2);
  });

  it('fechas en DD/MM/AAAA', () => {
    expect(fechaEs('2025-03-01')).toBe('01/03/2025');
  });
});
