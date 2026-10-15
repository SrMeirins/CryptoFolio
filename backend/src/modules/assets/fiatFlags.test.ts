import { describe, expect, it } from 'vitest';
import { FIAT_ICON_SYMBOLS, fiatFlagCountry, fiatFlagUrl } from './fiatFlags';

// Banderas de las monedas fiat (#246).
describe('fiatFlags', () => {
  it('el país sale del código ISO 4217; el euro usa la bandera de la UE', () => {
    expect(fiatFlagCountry('EUR')).toBe('eu');
    expect(fiatFlagCountry('USD')).toBe('us');
    expect(fiatFlagCountry('GBP')).toBe('gb');
    expect(fiatFlagCountry('CHF')).toBe('ch');
  });

  it('sin bandera para códigos supranacionales o inválidos', () => {
    expect(fiatFlagCountry('XAU')).toBeNull();
    expect(fiatFlagCountry('eur')).toBeNull();
    expect(fiatFlagCountry('EURO')).toBeNull();
    expect(fiatFlagCountry('../')).toBeNull();
  });

  it('URL HTTPS de flagcdn a 80 px de alto', () => {
    expect(fiatFlagUrl('EUR')).toBe('https://flagcdn.com/h80/eu.png');
    expect(fiatFlagUrl('XAU')).toBeNull();
  });

  it('todas las monedas fiat de la app tienen bandera', () => {
    expect(FIAT_ICON_SYMBOLS).toContain('EUR');
    expect(FIAT_ICON_SYMBOLS.every(s => fiatFlagUrl(s) !== null)).toBe(true);
  });
});
