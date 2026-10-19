import { describe, expect, it } from 'vitest';
import { getContrapartidaClave } from '../contrapartida';
import { sinTildes } from './rentaWebExport';

// Tildes en pantalla, formato Renta Web intacto (#313).
describe('descripción de la contrapartida', () => {
  it('lleva tildes en pantalla', () => {
    expect(getContrapartidaClave(null).descripcion).toBe('Sin contrapartida directa (comisión/pérdida)');
  });
  it('en el fichero Renta Web se escribe como siempre, sin tildes', () => {
    expect(sinTildes(getContrapartidaClave(null).descripcion)).toBe('Sin contrapartida directa (comision/perdida)');
    expect(sinTildes('Moneda de curso legal (EUR)')).toBe('Moneda de curso legal (EUR)');
  });
});
