import net from 'net';

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Primer puerto libre en loopback a partir de basePort (inclusive),
 * escaneando hacia arriba. Se verifica el estado REAL del sistema en cada
 * llamada — nunca se asume que un puerto sigue libre solo porque lo estaba
 * la última vez que arrancó la app.
 */
export async function findFreePort(basePort: number, maxTries = 100): Promise<number> {
  for (let port = basePort; port < basePort + maxTries; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No se encontró un puerto libre cerca de ${basePort}`);
}
