import { describe, expect, it } from 'vitest';
import { avisoCalendario, calendarioFiscal } from './calendarioFiscal';

// Calendario fiscal (#309). Instantes en UTC; Madrid es UTC+1 en invierno y UTC+2 en verano.
const at = (iso: string) => new Date(iso);

describe('calendarioFiscal — próximo hito en los límites', () => {
  it('31 dic: cierre en curso, último día', () => {
    const c = calendarioFiscal(at('2026-12-31T12:00:00Z'));
    expect(c.proximo).toMatchObject({ id: 'cierre', ejercicio: 2026, estado: 'en-curso', diasRestantes: 0 });
  });
  it('1 ene en Madrid (31 dic 23:30 UTC): pasa a ser el 721 del año anterior', () => {
    const c = calendarioFiscal(at('2026-12-31T23:30:00Z'));
    expect(c.hoy).toBe('2027-01-01');
    expect(c.proximo).toMatchObject({ id: 'modelo721', ejercicio: 2026, estado: 'en-curso', diasRestantes: 89 });
  });
  it('31 mar: último día del 721; 1 abr: la Renta', () => {
    expect(calendarioFiscal(at('2027-03-31T10:00:00Z')).proximo).toMatchObject({ id: 'modelo721', diasRestantes: 0 });
    // La campaña abre hacia el 8 de abril: el 1 todavía no está abierta, pero es el próximo hito.
    expect(calendarioFiscal(at('2027-04-01T10:00:00Z')).proximo).toMatchObject({ id: 'renta', ejercicio: 2026, estado: 'proximo', inicioAproximado: true, diasRestantes: 90, diasParaAbrir: 7 });
    expect(calendarioFiscal(at('2027-04-08T10:00:00Z')).proximo).toMatchObject({ estado: 'en-curso', diasParaAbrir: 0 });
  });
  it('30 jun: último día de la Renta; 1 jul: el cierre del año', () => {
    expect(calendarioFiscal(at('2027-06-30T10:00:00Z')).proximo).toMatchObject({ id: 'renta', diasRestantes: 0 });
    expect(calendarioFiscal(at('2027-07-01T10:00:00Z')).proximo).toMatchObject({ id: 'cierre', ejercicio: 2027, diasRestantes: 183 });
  });
  it('la línea de tiempo son los tres hitos que vienen, en orden', () => {
    expect(calendarioFiscal(at('2026-10-19T10:00:00Z')).hitos.map(h => `${h.id}:${h.ejercicio}:${h.estado}`))
      .toEqual(['cierre:2026:en-curso', 'modelo721:2026:proximo', 'renta:2026:proximo']);
    expect(calendarioFiscal(at('2027-02-10T10:00:00Z')).hitos.map(h => h.id)).toEqual(['modelo721', 'renta', 'cierre']);
  });
});

describe('obligación del 721', () => {
  it('sin obligación, el 721 sigue en la línea de tiempo pero no es el próximo hito', () => {
    const c = calendarioFiscal(at('2027-02-10T10:00:00Z'), () => false)
    expect(c.hitos[0]).toMatchObject({ id: 'modelo721', obligado: false })
    expect(c.proximo.id).toBe('renta')
  })
  it('con obligación o sin saberlo, sí lo es', () => {
    expect(calendarioFiscal(at('2027-02-10T10:00:00Z'), () => true).proximo.id).toBe('modelo721')
    expect(calendarioFiscal(at('2027-02-10T10:00:00Z')).proximo.id).toBe('modelo721')
  })
  it('progreso del plazo abierto', () => {
    expect(calendarioFiscal(at('2026-07-02T10:00:00Z')).proximo.progreso).toBeCloseTo((182 / 364) * 100, 6)
  })
})

describe('avisoCalendario', () => {
  it('nada a más de 30 días, información a 30 y aviso a 7', () => {
    expect(avisoCalendario(at('2026-10-19T10:00:00Z'))).toBeNull();
    expect(avisoCalendario(at('2026-12-01T10:00:00Z'))).toMatchObject({ type: 'info' });
    expect(avisoCalendario(at('2026-12-24T10:00:00Z'))?.type).toBe('warning');
    expect(avisoCalendario(at('2027-03-30T10:00:00Z'))?.message).toBe('Modelo 721 de 2026: queda 1 día. Comprueba si estás obligado a presentarlo.');
  });
});
