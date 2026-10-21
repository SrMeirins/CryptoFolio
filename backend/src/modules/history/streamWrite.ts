import type { Writable } from 'stream';

/**
 * Espera a que `out` pueda aceptar más datos (#349). Se resuelve también si la
 * salida se cierra o falla: esperar solo a 'drain' colgaría la exportación
 * (y su conexión y transacción de Postgres) cuando el cliente se desconecta.
 * Devuelve false si ya no se puede seguir escribiendo.
 */
export function waitForDrain(out: Writable): Promise<boolean> {
  if (out.destroyed || out.writableEnded) return Promise.resolve(false);
  return new Promise(resolve => {
    const done = () => {
      out.off('drain', done);
      out.off('close', done);
      out.off('error', done);
      resolve(!out.destroyed && !out.writableEnded);
    };
    out.once('drain', done);
    out.once('close', done);
    out.once('error', done);
  });
}
