// Presupuesto de la cuota mensual de CoinPaprika (#337): 20.000 peticiones en el
// plan gratuito, informadas en las cabeceras ratelimit-*. Cerca del límite se
// deja de usar hasta el reinicio (y la cascada pasa a la siguiente fuente).

export class CuotaMensual {
  private restantes: number | null = null;
  private limite: number | null = null;
  private reinicioEn = 0;

  constructor(private readonly reserva = 0.1, private readonly ahora: () => number = Date.now) {}

  /** Lee ratelimit-limit, ratelimit-remaining y ratelimit-reset (segundos hasta el reinicio). */
  actualizar(cabeceras: { get(nombre: string): string | null }): void {
    const limite = Number(cabeceras.get('ratelimit-limit'));
    const restantes = Number(cabeceras.get('ratelimit-remaining'));
    const reset = Number(cabeceras.get('ratelimit-reset'));
    if (Number.isFinite(limite) && limite > 0) this.limite = limite;
    if (Number.isFinite(restantes)) this.restantes = restantes;
    if (Number.isFinite(reset) && reset > 0) this.reinicioEn = this.ahora() + reset * 1000;
  }

  hayPresupuesto(): boolean {
    if (this.restantes === null || this.limite === null) return true;
    if (this.ahora() >= this.reinicioEn && this.reinicioEn > 0) { this.restantes = null; return true; }
    return this.restantes > this.limite * this.reserva;
  }
}
