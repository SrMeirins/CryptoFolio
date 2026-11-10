import { describe, expect, it } from 'vitest';
import { avisoCalendario, calendarioFiscal, ventanaCiclo } from './calendarioFiscal';

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

describe('línea del ciclo fiscal (#538)', () => {
  it('ventana de 18 meses: del 1 del mes actual al último día del mes 17 después', () => {
    expect(ventanaCiclo('2026-11-10')).toEqual({ desde: '2026-11-01', hasta: '2028-04-30' });
    expect(ventanaCiclo('2027-01-31')).toEqual({ desde: '2027-01-01', hasta: '2028-06-30' });
    expect(ventanaCiclo('2027-12-15')).toEqual({ desde: '2027-12-01', hasta: '2029-05-31' });
  });
  it('el ciclo son todos los plazos que tocan la ventana, en orden de fin', () => {
    const c = calendarioFiscal(at('2026-11-10T10:00:00Z'));
    expect(c.ventana).toEqual({ desde: '2026-11-01', hasta: '2028-04-30' });
    expect(c.ciclo.map(h => `${h.id}:${h.ejercicio}`)).toEqual([
      'cierre:2026', 'modelo721:2026', 'renta:2026', 'cierre:2027', 'modelo721:2027', 'renta:2027',
    ]);
  });
  it('un plazo que acabó antes del mes actual no entra; el último día de un plazo sí', () => {
    expect(calendarioFiscal(at('2027-07-05T10:00:00Z')).ciclo.some(h => h.id === 'renta' && h.ejercicio === 2026)).toBe(false);
    expect(calendarioFiscal(at('2027-04-01T10:00:00Z')).ciclo.some(h => h.id === 'modelo721' && h.ejercicio === 2026)).toBe(false);
    expect(calendarioFiscal(at('2027-03-31T10:00:00Z')).ciclo[0]).toMatchObject({ id: 'modelo721', ejercicio: 2026, estado: 'en-curso', diasRestantes: 0 });
  });
  it('la línea del Dashboard y el próximo hito no cambian', () => {
    const c = calendarioFiscal(at('2026-10-19T10:00:00Z'));
    expect(c.hitos.map(h => `${h.id}:${h.ejercicio}`)).toEqual(['cierre:2026', 'modelo721:2026', 'renta:2026']);
    expect(c.proximo).toMatchObject({ id: 'cierre', ejercicio: 2026 });
  });
});

describe('lo ya presentado (#542)', () => {
  it('la Renta presentada no es el próximo plazo ni la recuerda la campana', () => {
    const presentada = (id: string, e: number) => id === 'renta' && e === 2026;
    const c = calendarioFiscal(at('2027-05-10T10:00:00Z'), () => false, undefined, presentada);
    expect(c.hitos.find(h => h.id === 'renta' && h.ejercicio === 2026)).toMatchObject({ presentado: true });
    expect(c.proximo).toMatchObject({ id: 'cierre', ejercicio: 2027 });
    expect(avisoCalendario(at('2027-06-20T10:00:00Z'), () => false, undefined, presentada)).toBeNull();
    expect(avisoCalendario(at('2027-06-20T10:00:00Z'), () => false)).toMatchObject({ type: 'info' });
  });
});
