import { describe, expect, it } from 'vitest';
import { getContraprestacion } from '../contrapartida';
import { sinTildes } from './rentaWebExport';

// Tildes en pantalla, fichero Renta Web en ASCII (#313).
const donacion = { operationType: 'GIFT_SENT', activoTransmitido: 'AAA', txAsset: 'AAA', costAsset: null, feeAsset: null };

describe('descripción de la contraprestación', () => {
  it('lleva tildes en pantalla', () => {
    expect(getContraprestacion(donacion).descripcion).toBe('Donación: sin contraprestación, revisar con un asesor');
  });
  it('en el fichero Renta Web se escribe sin tildes', () => {
    expect(sinTildes(getContraprestacion(donacion).descripcion)).toBe('Donacion: sin contraprestacion, revisar con un asesor');
    expect(sinTildes('Moneda de curso legal, EUR (F)')).toBe('Moneda de curso legal, EUR (F)');
  });
});
