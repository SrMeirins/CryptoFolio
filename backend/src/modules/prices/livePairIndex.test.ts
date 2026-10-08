import { describe, expect, it } from 'vitest';
import { buildPairIndex, resolveTick, streamPairs, type AssetPairsRow } from './livePairIndex';

function row(symbol: string, pairs: Partial<Omit<AssetPairsRow, 'symbol'>> = {}): AssetPairsRow {
  return {
    symbol,
    binance_eur_pair: null, binance_usdt_pair: null, binance_btc_pair: null, binance_eth_pair: null,
    ...pairs,
  };
}

const rates = { eurUsdtRate: 0.9, btcEur: 50_000, ethEur: 3_000 };

describe('livePairIndex — buildPairIndex', () => {
  it('cada activo se indexa solo por su par preferido (EUR > USDT > BTC > ETH)', () => {
    const index = buildPairIndex([
      row('XRP', { binance_eur_pair: 'XRPEUR', binance_usdt_pair: 'XRPUSDT', binance_btc_pair: 'XRPBTC' }),
      row('HBAR', { binance_usdt_pair: 'HBARUSDT', binance_btc_pair: 'HBARBTC' }),
    ]);

    expect(index.get('XRPEUR')).toEqual([{ asset: 'XRP', kind: 'eur' }]);
    expect(index.has('XRPUSDT')).toBe(false);
    expect(index.has('XRPBTC')).toBe(false);
    expect(index.get('HBARUSDT')).toEqual([{ asset: 'HBAR', kind: 'usdt' }]);
  });

  it('ignora activos sin ningún par de Binance (CoinGecko, fiat)', () => {
    const index = buildPairIndex([row('NFT'), row('EUR')]);
    expect(index.size).toBe(0);
  });

  it('añade BTCEUR/ETHEUR como referencia si algún activo cotiza contra BTC/ETH y no están registrados', () => {
    const index = buildPairIndex([
      row('AAA', { binance_btc_pair: 'AAABTC' }),
      row('BBB', { binance_eth_pair: 'BBBETH' }),
    ]);
    expect(index.get('BTCEUR')).toEqual([{ asset: 'BTC', kind: 'eur' }]);
    expect(index.get('ETHEUR')).toEqual([{ asset: 'ETH', kind: 'eur' }]);
  });

  it('no duplica la referencia BTC si BTC ya está registrado', () => {
    const index = buildPairIndex([
      row('BTC', { binance_eur_pair: 'BTCEUR' }),
      row('AAA', { binance_btc_pair: 'AAABTC' }),
    ]);
    expect(index.get('BTCEUR')).toEqual([{ asset: 'BTC', kind: 'eur' }]);
  });

  it('normaliza los pares a mayúsculas (como llegan en los mensajes de Binance)', () => {
    const index = buildPairIndex([row('XRP', { binance_eur_pair: 'xrpeur' })]);
    expect(index.has('XRPEUR')).toBe(true);
  });
});

describe('livePairIndex — streamPairs', () => {
  it('incluye siempre EURUSDT y una sola vez cada par', () => {
    const index = buildPairIndex([
      row('XRP', { binance_eur_pair: 'XRPEUR' }),
      row('HBAR', { binance_usdt_pair: 'HBARUSDT' }),
    ]);
    expect(streamPairs(index).sort()).toEqual(['EURUSDT', 'HBARUSDT', 'XRPEUR']);
  });
});

describe('livePairIndex — resolveTick', () => {
  const index = buildPairIndex([
    row('XRP', { binance_eur_pair: 'XRPEUR' }),
    row('HBAR', { binance_usdt_pair: 'HBARUSDT' }),
    row('AAA', { binance_btc_pair: 'AAABTC' }),
    row('BBB', { binance_eth_pair: 'BBBETH' }),
  ]);

  it('par EUR: precio directo', () => {
    expect(resolveTick(index, 'XRPEUR', 2, rates)).toEqual([['XRP', 2]]);
  });

  it('par USDT: convierte con EURUSDT', () => {
    const [[asset, price]] = resolveTick(index, 'HBARUSDT', 0.2, rates);
    expect(asset).toBe('HBAR');
    expect(price).toBeCloseTo(0.18, 10);
  });

  it('pares BTC/ETH: convierten con el precio en vivo de la referencia', () => {
    expect(resolveTick(index, 'AAABTC', 0.0001, rates)).toEqual([['AAA', 5]]);
    expect(resolveTick(index, 'BBBETH', 0.001, rates)).toEqual([['BBB', 3]]);
  });

  it('sin precio de la referencia BTC todavía: no emite nada', () => {
    expect(resolveTick(index, 'AAABTC', 0.0001, { ...rates, btcEur: undefined })).toEqual([]);
  });

  it('par no indexado o precio no válido: no emite nada', () => {
    expect(resolveTick(index, 'XRPUSDT', 2, rates)).toEqual([]);
    expect(resolveTick(index, 'XRPEUR', 0, rates)).toEqual([]);
    expect(resolveTick(index, 'XRPEUR', NaN, rates)).toEqual([]);
  });
});
