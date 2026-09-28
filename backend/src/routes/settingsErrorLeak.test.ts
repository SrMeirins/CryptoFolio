import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Se mockea la BD para forzar un error real y determinista en el catch de la
// ruta, sin depender de una condición de red/estado difícil de reproducir.
// Es el mismo enfoque de mocking que ya usa el proyecto para dependencias
// externas (ver etherscanProvider.test.ts, que mockea fetch).
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
  pool: {},
}));

describe('settings.ts — el catch no filtra err.message crudo al cliente', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('POST /api/settings/transactions/fix-stale-withdrawals: responde genérico, no el error interno', async () => {
    // Mensaje realista de un error de Postgres, con detalle interno del
    // esquema — exactamente lo que antes se devolvía tal cual al cliente.
    queryMock.mockRejectedValueOnce(
      new Error('relation "raw_transactions" does not exist — column t.notes violates not-null constraint')
    );

    const app = (await import('../app')).default;
    const res = await request(app).post('/api/settings/transactions/fix-stale-withdrawals');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Error al corregir los retiros pendientes');
    // El mensaje interno del driver/esquema NUNCA debe llegar al cliente.
    expect(JSON.stringify(res.body)).not.toMatch(/raw_transactions|not-null constraint/);
  });
});
