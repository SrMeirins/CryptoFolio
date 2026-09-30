import { describe, expect, it, afterEach } from 'vitest';
import net from 'net';
import { findFreePort } from './find-free-port';

function listenOn(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// Base alta y poco probable de colisionar con otros procesos reales de la
// máquina donde corran los tests.
const TEST_BASE = 48800;

describe('findFreePort', () => {
  const servers: net.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close));
  });

  it('devuelve la propia base si ya está libre', async () => {
    const port = await findFreePort(TEST_BASE);
    expect(port).toBe(TEST_BASE);
  });

  it('salta al siguiente puerto si la base está realmente ocupada', async () => {
    const busyPort = TEST_BASE + 10;
    servers.push(await listenOn(busyPort));

    const port = await findFreePort(busyPort);
    expect(port).toBe(busyPort + 1);
  });

  it('salta varios puertos ocupados seguidos, no solo el primero', async () => {
    const busyBase = TEST_BASE + 20;
    servers.push(await listenOn(busyBase));
    servers.push(await listenOn(busyBase + 1));
    servers.push(await listenOn(busyBase + 2));

    const port = await findFreePort(busyBase);
    expect(port).toBe(busyBase + 3);
  });

  it('lanza un error claro si no encuentra ninguno libre dentro del límite de intentos', async () => {
    const busyBase = TEST_BASE + 30;
    for (let p = busyBase; p < busyBase + 5; p++) {
      servers.push(await listenOn(p));
    }

    await expect(findFreePort(busyBase, 5)).rejects.toThrow(/No se encontró un puerto libre/);
  });
});
