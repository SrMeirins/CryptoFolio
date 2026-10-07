import { describe, expect, it } from 'vitest';
import {
  ALL_BINANCE_OPERATIONS,
  ALL_KNOWN_OPERATIONS,
  ALL_IGNORED_OPERATIONS,
  ACCOUNT_TO_WALLET,
  TRANSFER_DESTINATIONS,
} from './binanceAccounts';

// binanceAccounts.ts es la "fuente de verdad" del módulo CSV — no tenía
// ningún test propio. Estos cubren invariantes reales de los datos
// estáticos, no lógica: una duplicación accidental de csvLabel al añadir
// una operación nueva podría pasar desapercibida en una revisión de código
// (dos líneas casi idénticas) pero rompería ALL_KNOWN_OPERATIONS en
// silencio (Set colapsa duplicados sin avisar).
describe('ALL_BINANCE_OPERATIONS — invariantes del catálogo', () => {
  it('no tiene csvLabel duplicados', () => {
    const labels = ALL_BINANCE_OPERATIONS.map(op => op.csvLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('cada operación tiene csvLabel, internalType y status no vacíos', () => {
    for (const op of ALL_BINANCE_OPERATIONS) {
      expect(op.csvLabel.length).toBeGreaterThan(0);
      expect(op.internalType.length).toBeGreaterThan(0);
      expect(['supported', 'ignored', 'pending']).toContain(op.status);
    }
  });
});

describe('ALL_KNOWN_OPERATIONS / ALL_IGNORED_OPERATIONS — derivados correctamente', () => {
  it('ALL_KNOWN_OPERATIONS contiene exactamente los csvLabel del catálogo', () => {
    expect(ALL_KNOWN_OPERATIONS.size).toBe(ALL_BINANCE_OPERATIONS.length);
    for (const op of ALL_BINANCE_OPERATIONS) {
      expect(ALL_KNOWN_OPERATIONS.has(op.csvLabel)).toBe(true);
    }
  });

  it('ALL_IGNORED_OPERATIONS es subconjunto de ALL_KNOWN_OPERATIONS y solo contiene status=ignored', () => {
    for (const label of ALL_IGNORED_OPERATIONS) {
      expect(ALL_KNOWN_OPERATIONS.has(label)).toBe(true);
      const op = ALL_BINANCE_OPERATIONS.find(o => o.csvLabel === label);
      expect(op?.status).toBe('ignored');
    }
  });
});

describe('ACCOUNT_TO_WALLET / TRANSFER_DESTINATIONS — consistencia', () => {
  it('ACCOUNT_TO_WALLET no tiene valores vacíos', () => {
    for (const wallet of Object.values(ACCOUNT_TO_WALLET)) {
      expect(wallet.length).toBeGreaterThan(0);
    }
  });

  it('cada cuenta destino en TRANSFER_DESTINATIONS (salvo el gate de Inter-Wallet Transfer) resuelve a un nombre de wallet real', () => {
    for (const [op, accountMap] of Object.entries(TRANSFER_DESTINATIONS)) {
      if (op === 'Inter-Wallet Transfer') continue; // gate dinámico, sin mapeo estático — ver comentario en el propio fichero
      for (const destWallet of Object.values(accountMap)) {
        expect(Object.values(ACCOUNT_TO_WALLET)).toContain(destWallet);
      }
    }
  });
});
