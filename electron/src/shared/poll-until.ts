/**
 * Sondea `probe` hasta que devuelva true o se agote `timeoutMs`, esperando
 * `intervalMs` entre intentos. Si `probe` lanza, el error se propaga de
 * inmediato (sin más reintentos) — útil para condiciones irrecuperables
 * detectadas a mitad del sondeo (p. ej. el proceso vigilado ya ha muerto).
 *
 * Mismo patrón de espera con deadline usado antes por separado en
 * backend-manager.ts (sondeo HTTP) y postgres-manager.ts (conexión a
 * Postgres) — extraído aquí como única fuente de verdad.
 */
export async function pollUntil(
  probe: () => Promise<boolean>,
  // timeoutMessage acepta una función porque el mensaje suele necesitar
  // datos que solo se conocen DESPUÉS del sondeo (p. ej. los últimos logs
  // acumulados durante la espera) — una función se evalúa en el momento del
  // timeout, no al llamar a pollUntil.
  opts: { timeoutMs: number; intervalMs: number; timeoutMessage: string | (() => string) },
): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(typeof opts.timeoutMessage === 'function' ? opts.timeoutMessage() : opts.timeoutMessage);
}
