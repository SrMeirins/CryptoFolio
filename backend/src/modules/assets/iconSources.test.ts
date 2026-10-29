import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LOCAL_ICONS_DIR, bestCoinGeckoMatch, isIconSymbol, isValidCoinGeckoId, localIcon } from './iconSources';

// Fuentes de logo (#449). Datos sintéticos y una carpeta temporal.
let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('iconSources', () => {
  it('ids de CoinGecko y símbolos válidos', () => {
    expect(isValidCoinGeckoId('shiba-inu')).toBe(true);
    for (const id of ['', 'Bitcoin', '../x', 'a b', 'x'.repeat(101), 5]) expect(isValidCoinGeckoId(id)).toBe(false);
    expect(isIconSymbol('BTC')).toBe(true);
    for (const s of ['../BTC', 'btc', 'B/C', '']) expect(isIconSymbol(s)).toBe(false);
  });

  it('elige el mismo símbolo exacto con mayor capitalización e ignora ids no válidos', () => {
    const coins = [
      { id: 'sin-rango', symbol: 'SHIB', market_cap_rank: null },
      { id: 'grande', symbol: 'shib', market_cap_rank: 15 },
      { id: 'Mal Id', symbol: 'SHIB', market_cap_rank: 1 },
      { id: 'otro', symbol: 'SHIBX', market_cap_rank: 2 },
    ];
    expect(bestCoinGeckoMatch(coins, 'SHIB')).toBe('grande');
    expect(bestCoinGeckoMatch([], 'SHIB')).toBeNull();
    expect(bestCoinGeckoMatch('no es una lista', 'SHIB')).toBeNull();
  });

  it('lee el PNG del paquete local por símbolo y nunca sale de su carpeta', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'cf-icons-'));
    const pack = path.join(dir, 'pack');
    mkdirSync(pack);
    writeFileSync(path.join(pack, 'sint.png'), 'png');
    writeFileSync(path.join(dir, 'fuera.png'), 'secreto');
    symlinkSync(path.join(dir, 'fuera.png'), path.join(pack, 'enlace.png'));
    expect(localIcon('SINT', pack)?.toString()).toBe('png');
    expect(localIcon('NOHAY', pack)).toBeNull();
    expect(localIcon('../FUERA', pack)).toBeNull();
    expect(localIcon('ENLACE', pack)).toBeNull();
  });

  it('el paquete incluido tiene logos de activos comunes', () => {
    for (const s of ['BTC', 'DOGE', 'TRX', 'USDT']) expect(localIcon(s, LOCAL_ICONS_DIR)?.subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});
