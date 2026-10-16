import { describe, expect, it } from 'vitest';
import { buildPairIndex, pickSource, priceFromPairMap, resolveTick, streamPairs, PAIR_STALE_MS, type AssetPairsRow } from './livePairIndex';

function row(symbol: string, pairs: Partial<Omit<AssetPairsRow, 'symbol'>> = {}): AssetPairsRow {
  return {
    symbol,
    binance_eur_pair: null, binance_usdt_pair: null, binance_btc_pair: null, binance_eth_pair: null,
    ...pairs,
  };
}

const rates = { eurUsdtRate: 0.9, btcEur: 50_000, ethEur: 3_000 };

describe('livePairIndex — buildPairIndex', () => {
  it('cada activo se indexa por todos sus pares (#277): el selector elige la fuente', () => {
    const index = buildPairIndex([
      row('XRP', { binance_eur_pair: 'XRPEUR', binance_usdt_pair: 'XRPUSDT', binance_btc_pair: 'XRPBTC' }),
      row('HBAR', { binance_usdt_pair: 'HBARUSDT', binance_btc_pair: 'HBARBTC' }),
    ]);

    expect(index.get('XRPEUR')).toEqual([{ asset: 'XRP', kind: 'eur' }]);
    expect(index.get('XRPUSDT')).toEqual([{ asset: 'XRP', kind: 'usdt' }]);
    expect(index.get('XRPBTC')).toEqual([{ asset: 'XRP', kind: 'btc' }]);
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

  it('par EUR: precio directo, con el tipo de par', () => {
    expect(resolveTick(index, 'XRPEUR', 2, rates)).toEqual([['XRP', 2, 'eur']]);
  });

  it('par USDT: convierte con EURUSDT', () => {
    const [[asset, price]] = resolveTick(index, 'HBARUSDT', 0.2, rates);
    expect(asset).toBe('HBAR');
    expect(price).toBeCloseTo(0.18, 10);
  });

  it('pares BTC/ETH: convierten con el precio en vivo de la referencia', () => {
    expect(resolveTick(index, 'AAABTC', 0.0001, rates)).toEqual([['AAA', 5, 'btc']]);
    expect(resolveTick(index, 'BBBETH', 0.001, rates)).toEqual([['BBB', 3, 'eth']]);
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

describe('livePairIndex — priceFromPairMap (precios REST, #147)', () => {
  const prices = new Map([['XRPEUR', 2], ['XRPUSDT', 2.5], ['HBARUSDT', 0.2], ['AAABTC', 0.0001]]);

  it('respeta la cascada USDT > EUR > BTC > ETH, la misma que el WebSocket (#277)', () => {
    expect(priceFromPairMap(row('XRP', { binance_eur_pair: 'XRPEUR', binance_usdt_pair: 'XRPUSDT' }), prices, rates)).toBeCloseTo(2.25, 10);
  });

  it('cae al par EUR si no hay precio del par USDT', () => {
    expect(priceFromPairMap(row('XRP', { binance_eur_pair: 'XRPEUR', binance_usdt_pair: 'XRPXUSDT' }), prices, rates)).toBe(2);
  });

  it('convierte pares BTC con la referencia indicada y devuelve null si falta', () => {
    expect(priceFromPairMap(row('AAA', { binance_btc_pair: 'AAABTC' }), prices, rates)).toBe(5);
    expect(priceFromPairMap(row('AAA', { binance_btc_pair: 'AAABTC' }), prices, { ...rates, btcEur: undefined })).toBeNull();
  });

  it('sin ningún precio disponible devuelve null', () => {
    expect(priceFromPairMap(row('NFT'), prices, rates)).toBeNull();
  });
});

describe('livePairIndex — pickSource: el más rápido con respaldo (#277)', () => {
  const now = 1_000_000;
  const fresh = now - 1_000;
  const stale = now - PAIR_STALE_MS - 1;

  it('usa el par de mayor prioridad con datos recientes (USDT > EUR > BTC > ETH)', () => {
    expect(pickSource({ eur: { at: fresh }, usdt: { at: fresh } }, now)).toBe('usdt');
    expect(pickSource({ eur: { at: fresh }, btc: { at: fresh } }, now)).toBe('eur');
  });

  it('si el preferido lleva más de 15 s sin datos, usa otro par que sí los tenga', () => {
    expect(pickSource({ usdt: { at: stale }, eur: { at: fresh } }, now)).toBe('eur');
  });

  it('sin ningún par reciente, el último que emitió: nunca se queda sin fuente', () => {
    expect(pickSource({ usdt: { at: stale - 5_000 }, eur: { at: stale } }, now)).toBe('eur');
    expect(pickSource({ btc: { at: stale } }, now)).toBe('btc');
  });

  it('sin ningún dato, null', () => {
    expect(pickSource({}, now)).toBeNull();
  });
});
