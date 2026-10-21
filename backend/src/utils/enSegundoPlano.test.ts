import { afterEach, describe, expect, it, vi } from 'vitest';
import { enSegundoPlano } from './enSegundoPlano';

// Tareas en segundo plano (#336).
describe('enSegundoPlano', () => {
  const original = process.env.VITEST;
  afterEach(() => { process.env.VITEST = original; vi.restoreAllMocks(); });

  it('en los tests no lanza la tarea', () => {
    const tarea = vi.fn(async () => {});
    enSegundoPlano('x', tarea);
    expect(tarea).not.toHaveBeenCalled();
  });

  it('fuera de los tests la lanza y registra su fallo sin propagarlo', async () => {
    delete process.env.VITEST;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    enSegundoPlano('prueba', async () => { throw new Error('caída'); });
    await new Promise(r => setTimeout(r, 0));
    expect(log).toHaveBeenCalledWith('[prueba] tarea en segundo plano fallida:', 'caída');
  });
});
