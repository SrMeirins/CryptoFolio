import { describe, expect, it, vi } from 'vitest';
import cron from 'node-cron';
import { scheduleWalletSync } from './scheduler';

describe('scheduler', () => {
  it('programa exactamente una tarea cron con el patrón diario 03:00', () => {
    const spy = vi.spyOn(cron, 'schedule');
    scheduleWalletSync();
    expect(spy).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    spy.mockRestore();
  });
});
