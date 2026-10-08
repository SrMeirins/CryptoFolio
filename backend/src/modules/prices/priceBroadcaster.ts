// Difusión agrupada de precios en vivo a los suscriptores (WebSocket de la app).
// Antes cada mensaje de Binance copiaba y enviaba el snapshot completo a cada
// cliente: decenas de mensajes por segundo y cliente (#148). Ahora los cambios
// se acumulan y se emiten como mucho una vez por intervalo, solo con los
// precios que han cambiado (delta). El snapshot completo se envía al conectar.

export type PriceListener = (changes: Map<string, number>) => void;

export interface PriceBroadcaster {
  subscribe(listener: PriceListener): void;
  unsubscribe(listener: PriceListener): void;
  // Encola un precio; se ignora si no cambia respecto al último encolado/emitido.
  queue(symbol: string, price: number): void;
  // Emite inmediatamente los cambios pendientes.
  flush(): void;
  stop(): void;
}

export function createPriceBroadcaster(intervalMs = 1000, now: () => number = Date.now): PriceBroadcaster {
  const listeners = new Set<PriceListener>();
  const pending = new Map<string, number>();
  const lastKnown = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFlush = 0;

  function flush(): void {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending.size === 0) return;
    lastFlush = now();
    const changes = new Map(pending);
    pending.clear();
    for (const listener of [...listeners]) {
      try { listener(changes); } catch { /* un suscriptor roto no afecta al resto */ }
    }
  }

  function schedule(): void {
    if (timer) return;
    // Primer cambio tras un periodo sin emitir: sale enseguida; si no, espera
    // a completar el intervalo desde la última emisión.
    const wait = Math.max(0, intervalMs - (now() - lastFlush));
    timer = setTimeout(flush, wait);
  }

  return {
    subscribe: (listener) => { listeners.add(listener); },
    unsubscribe: (listener) => { listeners.delete(listener); },
    queue(symbol, price) {
      if (lastKnown.get(symbol) === price) return;
      lastKnown.set(symbol, price);
      pending.set(symbol, price);
      schedule();
    },
    flush,
    stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      pending.clear();
    },
  };
}
