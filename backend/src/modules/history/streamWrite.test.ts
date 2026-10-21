import { describe, expect, it } from 'vitest';
import { Writable } from 'stream';
import { waitForDrain } from './streamWrite';

// Una salida lenta que no vacía su búfer hasta que se le pide.
function slowOut(): Writable & { flush: () => void } {
  let pending: (() => void) | null = null;
  const out = new Writable({
    highWaterMark: 4,
    write(_chunk, _enc, cb) { pending = cb; },
  }) as Writable & { flush: () => void };
  out.flush = () => { const cb = pending; pending = null; cb?.(); };
  return out;
}

describe('waitForDrain (#349)', () => {
  it('se resuelve con true cuando la salida se vacía', async () => {
    const out = slowOut();
    expect(out.write('123456789')).toBe(false);
    const wait = waitForDrain(out);
    out.flush();
    await expect(wait).resolves.toBe(true);
  });

  it('se resuelve con false si el cliente se desconecta mientras espera (no se cuelga)', async () => {
    const out = slowOut();
    out.write('123456789');
    const wait = waitForDrain(out);
    out.destroy();
    await expect(wait).resolves.toBe(false);
  });

  it('con la salida ya cerrada responde false al instante', async () => {
    const out = slowOut();
    out.destroy();
    await expect(waitForDrain(out)).resolves.toBe(false);
  });

  it('no deja oyentes colgados tras resolverse', async () => {
    const out = slowOut();
    out.write('123456789');
    const wait = waitForDrain(out);
    out.flush();
    await wait;
    expect(out.listenerCount('close')).toBe(0);
    expect(out.listenerCount('drain')).toBe(0);
  });
});
