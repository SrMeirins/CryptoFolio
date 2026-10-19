import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
// La valoración real de la cartera mide un presupuesto con Date.now(), que aquí
// está congelado: la obligación del 721 se sustituye por «sin obligación».
// Su cálculo real tiene su propio test (obligacion721.test.ts).
vi.mock('../../modules/fiscal/obligacion721', () => ({ obligaciones721: async () => () => false }));

// Calendario fiscal y su aviso en la campana (#309). Solo se falsea la fecha.
let testDb: TestDatabase;
let app: import('express').Express;

describe('calendario fiscal (#309)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../../app')).default;
  });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  it('GET /api/fiscal/calendario: próximo hito y ciclo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-02-10T10:00:00Z'));
    const r = (await request(app).get('/api/fiscal/calendario')).body;
    expect(r.hoy).toBe('2027-02-10');
    // Sin cartera no hay obligación del 721: sale en la línea de tiempo, pero el próximo hito es la Renta.
    expect(r.hitos[0]).toMatchObject({ id: 'modelo721', ejercicio: 2026, estado: 'en-curso', diasRestantes: 49, obligado: false });
    expect(r.hitos.map((h: { id: string }) => h.id)).toEqual(['modelo721', 'renta', 'cierre']);
    expect(r.proximo).toMatchObject({ id: 'renta', ejercicio: 2026 });
  });

  it('la campana avisa a 7 días y calla a más de 30', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-06-25T10:00:00Z'));   // a 5 días del fin de la Renta
    const cerca = (await request(app).get('/api/settings/notifications')).body.find((n: { id: string }) => n.id === 'fiscal-calendar');
    expect(cerca).toMatchObject({ type: 'warning', category: 'Fiscal' });
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    const lejos = (await request(app).get('/api/settings/notifications')).body.find((n: { id: string }) => n.id === 'fiscal-calendar');
    expect(lejos).toBeUndefined();
  });
});
