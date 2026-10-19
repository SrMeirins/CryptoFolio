import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { madridYearMonth } from './madridTime';

// Obligación del 721 para el calendario (#309), con el reloj real y una base
// de prueba vacía. Import dinámico: db/client debe leer DATABASE_URL de test.
let testDb: TestDatabase;

describe('obligaciones721 (#309)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  it('sin cartera no hay obligación, y el cálculo se reutiliza en el día', async () => {
    const { obligaciones721, resetObligaciones721Cache } = await import('./obligacion721');
    resetObligaciones721Cache();
    const y = madridYearMonth().year;
    const t0 = Date.now();
    const o = await obligaciones721();
    expect(o(y - 1)).toBe(false);
    expect(o(y)).toBe(false);
    expect(o(1999)).toBeNull();
    const t1 = Date.now();
    await obligaciones721();
    // La segunda llamada no vuelve a valorar: es inmediata.
    expect(Date.now() - t1).toBeLessThanOrEqual(Math.max(5, (t1 - t0)));
  });
});
