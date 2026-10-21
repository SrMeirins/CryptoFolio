/**
 * Lanza una tarea sin esperarla (p. ej. tras responder a una importación) y
 * registra su fallo. En los tests no se lanza: sobreviviría a la BD de test, que
 * se borra al acabar cada fichero, y su conexión cortada rompería la ejecución.
 * Los tests que comprueban el disparo espían a quien la llama.
 */
export function enSegundoPlano(nombre: string, tarea: () => Promise<unknown>): void {
  if (process.env.VITEST) return;
  tarea().catch(err => console.error(`[${nombre}] tarea en segundo plano fallida:`, err instanceof Error ? err.message : err));
}
