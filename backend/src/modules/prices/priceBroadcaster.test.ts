import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPriceBroadcaster } from './priceBroadcaster';

describe('priceBroadcaster', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const now = () => Date.now();

  it('agrupa varios cambios en una sola emisión por intervalo, solo con lo modificado', () => {
    const b = createPriceBroadcaster(1000, now);
    const listener = vi.fn();
    b.subscribe(listener);

    b.queue('XRP', 2);
    vi.advanceTimersByTime(0);              // primera emisión tras un periodo sin emitir: inmediata
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(new Map([['XRP', 2]]));

    b.queue('XRP', 2.1);
    b.queue('HBAR', 0.2);
    b.queue('XRP', 2.2);
    vi.advanceTimersByTime(999);
    expect(listener).toHaveBeenCalledTimes(1); // aún dentro del intervalo

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(new Map([['XRP', 2.2], ['HBAR', 0.2]]));
  });

  it('no emite si el precio no ha cambiado', () => {
    const b = createPriceBroadcaster(1000, now);
    const listener = vi.fn();
    b.subscribe(listener);

    b.queue('XRP', 2);
    vi.advanceTimersByTime(1000);
    b.queue('XRP', 2);
    vi.advanceTimersByTime(5000);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe deja de notificar y es idempotente', () => {
    const b = createPriceBroadcaster(1000, now);
    const listener = vi.fn();
    b.subscribe(listener);
    b.unsubscribe(listener);
    b.unsubscribe(listener);

    b.queue('XRP', 2);
    vi.advanceTimersByTime(1000);
    expect(listener).not.toHaveBeenCalled();
  });

  it('un suscriptor que lanza no impide notificar al resto', () => {
    const b = createPriceBroadcaster(1000, now);
    const ok = vi.fn();
    b.subscribe(() => { throw new Error('cliente roto'); });
    b.subscribe(ok);

    b.queue('XRP', 2);
    vi.advanceTimersByTime(0);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('stop cancela la emisión pendiente', () => {
    const b = createPriceBroadcaster(1000, now);
    const listener = vi.fn();
    b.subscribe(listener);

    b.queue('XRP', 2);
    b.stop();
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
  });
});
