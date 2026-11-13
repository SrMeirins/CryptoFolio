import { describe, expect, it } from 'vitest';
import { cant, eur, pdfBuffer } from './pdfExport';
import { construirExport } from './datosExport';
import type { EventoFiscal } from '../eventosAnio';

// PDF imprimible (#547): formato de importes y paginación de un ejercicio largo. Datos sintéticos.
const ev = (i: number): EventoFiscal => ({
  fecha: '2025-03-01', fechaHora: '2025-03-01T10:00:00Z', tipo: 'Venta', activoTransmitido: 'AAA', activoRecibido: null,
  cantidadTransmitida: 1, contrapartidaClave: 'F', contrapartidaDescripcion: 'Euros', contrapartidaRevisar: false,
  valorTransmisionEur: 100, gastosTransmisionEur: 0, valorAdquisicionEur: 50, gastosAdquisicionEur: 0, gananciaPerdidaEur: 50,
  wallet: 'Uno', txId: `t${i}`, fechaAdquisicion: '2024-01-01', eventId: `e${i}`, comisionCompraEur: 0, esConvert: false, valoracion: null,
  valorEntregadoEur: null, valorRecibidoEur: null, canal: 'orden', permutaWrapStaking: false, lostSinMotivo: false, posiblePerdidaDiferida: false,
});
const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('pdfExport', () => {
  it('importes con punto de miles (también de 4 cifras) y coma decimal, sin -0,00', () => {
    expect(eur(1234.5)).toBe('1.234,50 €');
    expect(eur(-1234567.891)).toBe('-1.234.567,89 €');
    expect(eur(-0.001)).toBe('0,00 €');
    expect(cant(0.123)).toBe('0,123');
    expect(cant(1234)).toBe('1.234');
  });

  it('un ejercicio largo ocupa varias páginas, sin páginas de más', async () => {
    const corto = construirExport({ year: 2025, eventos: [ev(0)], rendimientos: [], anios: [{ year: 2025, netoGP: 50, rendimientos: 0 }], tipos: [19, 21, 23, 27, 30] });
    const largo = construirExport({ year: 2025, eventos: Array.from({ length: 120 }, (_, i) => ev(i)), rendimientos: [], anios: [{ year: 2025, netoGP: 6000, rendimientos: 0 }], tipos: [19, 21, 23, 27, 30] });
    const p1 = paginas(await pdfBuffer(corto, ['resumen', 'operaciones'], '13/11/2026'));
    const p2 = paginas(await pdfBuffer(largo, ['resumen', 'operaciones'], '13/11/2026'));
    expect(p1).toBe(1);
    // ~30 filas por página: 120 operaciones y el resumen caben en 5 páginas como mucho.
    expect(p2).toBeGreaterThanOrEqual(4);
    expect(p2).toBeLessThanOrEqual(6);
  });
});
