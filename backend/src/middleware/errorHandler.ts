import type { Request, Response, NextFunction } from 'express';

// Responde con un error genérico sin filtrar detalles internos (stack,
// mensaje de Postgres, rutas de fichero...) al cliente. Loguea el detalle
// real en servidor.
//
// Pensado para que las rutas individuales lo reutilicen en sus propios
// try/catch en vez de reimplementar `res.status(500).json({ error:
// (e as Error).message })` — ese patrón, repetido en varios endpoints
// (routes/prices.ts, fifo.ts, imports.ts, transactions.ts), filtra
// detalles internos al cliente saltándose esta misma protección.
export function sendInternalError(res: Response, err: unknown, context?: string) {
  const detail = err instanceof Error ? err.stack ?? err.message : err;
  console.error(context ? `[ERROR] ${context}:` : '[ERROR]', detail);
  res.status(500).json({ error: 'Internal server error' });
}

// Error handler global de Express (última pieza del middleware chain) —
// red de seguridad para cualquier error no capturado localmente.
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  sendInternalError(res, err);
}
