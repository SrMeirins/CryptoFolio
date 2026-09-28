import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createTestDatabase, TestDatabase } from './test/setup-test-db';

// app.ts lee ELECTRON_MODE/BACKEND_PORT en el nivel superior del módulo (al
// construir el middleware de CORS) — hay que fijarlos ANTES de importar el
// módulo, con vi.resetModules() para forzar una carga en frío por test.
describe('CORS en modo Electron (ELECTRON_MODE=true) — no debe reflejar cualquier origen', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  async function loadAppWithElectronMode(backendPort = '3001') {
    vi.resetModules();
    process.env.ELECTRON_MODE = 'true';
    process.env.BACKEND_PORT = backendPort;
    const mod = await import('./app');
    return mod.default;
  }

  it('acepta el origen propio real de Electron (http://127.0.0.1:<BACKEND_PORT>)', async () => {
    const app = await loadAppWithElectronMode('3001');
    const res = await request(app).get('/health').set('Origin', 'http://127.0.0.1:3001');
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3001');
  });

  it('acepta peticiones sin cabecera Origin (same-origin real, el navegador puede omitirla)', async () => {
    const app = await loadAppWithElectronMode('3001');
    const res = await request(app).get('/health');
    // Sin Origin en la petición, cors() no añade Access-Control-Allow-Origin
    // (no hace falta: no es una petición cross-origin) — no debe fallar ni
    // reflejar nada.
    expect(res.status).not.toBe(500);
  });

  it('RECHAZA un origen arbitrario (no debe reflejar cualquier cosa)', async () => {
    const app = await loadAppWithElectronMode('3001');
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('RECHAZA el string "null" ahora que ya no se confía en file:// (Electron real usa http://127.0.0.1)', async () => {
    const app = await loadAppWithElectronMode('3001');
    const res = await request(app).get('/health').set('Origin', 'null');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('usa el BACKEND_PORT real configurado, no un 3001 hardcodeado', async () => {
    const app = await loadAppWithElectronMode('4321');
    const resOk = await request(app).get('/health').set('Origin', 'http://127.0.0.1:4321');
    expect(resOk.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4321');

    const resBad = await request(app).get('/health').set('Origin', 'http://127.0.0.1:3001');
    expect(resBad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
