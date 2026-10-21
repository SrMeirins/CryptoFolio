// Circuit breaker por fuente de respaldo (#337): tras varios fallos seguidos se
// deja de llamar a esa fuente durante un tiempo, en vez de insistir y añadir
// esperas a cada precio. Puro salvo el reloj, inyectable para los tests.

export class Circuito {
  private fallos = 0;
  private abiertoHasta = 0;

  constructor(
    private readonly umbral = 3,
    private readonly pausaMs = 5 * 60_000,
    private readonly ahora: () => number = Date.now,
  ) {}

  permitido(): boolean {
    return this.ahora() >= this.abiertoHasta;
  }

  exito(): void {
    this.fallos = 0;
  }

  fallo(): void {
    this.fallos++;
    if (this.fallos >= this.umbral) {
      this.abiertoHasta = this.ahora() + this.pausaMs;
      this.fallos = 0;
    }
  }
}
