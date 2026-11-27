import { describe, expect, it, vi } from 'vitest';
import { registrarRetiradas } from './registro';

// Registro de importaciones de retiradas (#548): sin BD, con un cliente simulado. Datos sintéticos.
const RET = 'Time,Coin,Network,Amount,Fee,Address,TXID,Status';
const csv = (...filas: string[]) => Buffer.from([RET, ...filas].join('\n'));

function clienteSimulado() {
  const hashes = new Set<string>();
  const query = vi.fn(async (_sql: string, p: unknown[]) => {
    const nuevo = !hashes.has(p[1] as string);
    hashes.add(p[1] as string);
    return { rowCount: nuevo ? 1 : 0, rows: [] };
  });
  return { query: query as never, llamadas: query };
}

describe('registrarRetiradas', () => {
  it('guarda el periodo y el número de retiradas completadas', async () => {
    const c = clienteSimulado();
    const a = csv(
      '2024-05-10 10:00:00,XRP,XRP,10,0.2,rSintetica1,,Completed',
      '2024-03-02 08:00:00,ETH,ETH,1,0.001,0xSintetica,,Completed',
      '2024-04-01 08:00:00,ETH,ETH,1,0.001,0xSintetica,,Cancelled',
    );
    const r = await registrarRetiradas(c, [{ filename: 'a.csv', buffer: a }]);
    expect(r).toEqual({ registradas: 1, repetidas: 0 });
    const params = c.llamadas.mock.calls[0][1];
    expect([params[0], params[2], params[3], params[4]]).toEqual(['a.csv', 2, '2024-03-02', '2024-05-10']);
  });

  it('el mismo contenido con otro nombre no se registra dos veces', async () => {
    const c = clienteSimulado();
    const a = csv('2024-05-10 10:00:00,XRP,XRP,10,0.2,rSintetica1,,Completed');
    const r = await registrarRetiradas(c, [{ filename: 'a.csv', buffer: a }, { filename: 'copia.csv', buffer: a }]);
    expect(r).toEqual({ registradas: 1, repetidas: 1 });
  });

  it('rechaza un fichero que no es un historial de retiradas', async () => {
    await expect(registrarRetiradas(clienteSimulado(), [{ filename: 'x.csv', buffer: Buffer.from('a,b\n1,2') }])).rejects.toThrow(/columnas esperadas/);
  });
});
