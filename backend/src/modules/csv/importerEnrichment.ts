import { db } from '../../db/client';
import { ParsedTransaction } from './types';
import { getHistoricalPriceEur } from '../prices/binance';
import { setCoinGeckoStatusCallback, prefetchHistoricalPrices as prefetchCoinGeckoHistoricalPrices } from '../prices/coingecko';

type StatusCallback = (message: string, progress?: number, total?: number) => void;

// Operaciones de rendimiento para las que se busca precio histórico al momento
// de recepción. Esto garantiza que price_per_unit quede guardado en la BD para
// el módulo fiscal e historial (el motor FIFO tiene su propio fallback, pero la
// tabla transactions quedaría con NULL sin este paso, y el fiscal mostraría
// 0 EUR). DEPOSIT_CRYPTO se incluye para tener precio de referencia como
// estimación del coste.
const INCOME_OP_TYPES = new Set(['STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP', 'DEPOSIT_CRYPTO']);

// Enriquece en memoria (muta pricePerUnit/costAsset/costAmount) las
// transacciones de rendimiento que aún no tienen precio. No devuelve nada:
// el caller sigue usando el mismo array de transacciones ya enriquecido.
export async function enrichIncomeTransactionsWithPrices(
  transactions: ParsedTransaction[],
  onStatus?: StatusCallback
): Promise<void> {
  const incomeTxs = transactions.filter(
    tx => INCOME_OP_TYPES.has(tx.operationType) && !tx.pricePerUnit
  );
  if (incomeTxs.length === 0) return;

  // Deduplicar pares únicos (symbol|fecha) y agrupar las txs que los comparten
  const uniquePairsMap = new Map<string, { symbol: string; date: Date; txList: ParsedTransaction[] }>();
  for (const tx of incomeTxs) {
    const key = `${tx.asset}|${tx.timestamp.toISOString().slice(0, 10)}`;
    if (!uniquePairsMap.has(key)) {
      uniquePairsMap.set(key, { symbol: tx.asset, date: tx.timestamp, txList: [] });
    }
    uniquePairsMap.get(key)!.txList.push(tx);
  }
  const uniquePairs = [...uniquePairsMap.values()];
  const totalPairs = uniquePairs.length;

  // Activar callback CoinGecko ANTES del prefetch para que rate limits y progreso
  // aparezcan en el log de la UI desde el primer momento.
  setCoinGeckoStatusCallback(onStatus);

  // Pre-warm precios CoinGecko via market_chart/range antes del loop de enriquecimiento.
  // Solo para activos que genuinamente usan CoinGecko como fuente (price_source='coingecko'
  // o sin price_source conocido). eur_direct/usdt_proxy/fiat tienen precio Binance → no tocar.
  const uniqueAssets = [...new Set(uniquePairs.map(p => p.symbol))];
  const geckoOnlyRes = await db.query(
    `SELECT symbol FROM asset_metadata
     WHERE symbol = ANY($1) AND coingecko_id IS NOT NULL
       AND price_source NOT IN ('eur_direct', 'usdt_proxy', 'fiat')`,
    [uniqueAssets]
  );
  const geckoOnlySymbols = new Set(geckoOnlyRes.rows.map((r: { symbol: string }) => r.symbol));
  const geckoPairs = uniquePairs.filter(p => geckoOnlySymbols.has(p.symbol));
  if (geckoPairs.length > 0) {
    const geckoAssets = [...new Set(geckoPairs.map(p => p.symbol))];
    onStatus?.(`🔄 Pre-cargando precios históricos CoinGecko para: ${geckoAssets.join(', ')} (${geckoPairs.length} fechas únicas, 1 llamada API por activo)...`);
    await prefetchCoinGeckoHistoricalPrices(geckoPairs.map(p => ({ symbol: p.symbol, date: p.date })));
    onStatus?.(`✓ Pre-carga CoinGecko completada para ${geckoAssets.length} activo${geckoAssets.length > 1 ? 's' : ''}`);
  }

  onStatus?.(`Enriqueciendo ${incomeTxs.length} operaciones de rendimiento — ${totalPairs} pares únicos (concurrencia 10)`, 0, totalPairs);

  // Concurrencia 10: Binance no tiene rate limit estricto, los pares que
  // recaigan en CoinGecko quedan serializados automáticamente por su cola.
  let completed = 0;
  const PRICE_CONCURRENCY = 10;
  for (let i = 0; i < uniquePairs.length; i += PRICE_CONCURRENCY) {
    const batch = uniquePairs.slice(i, i + PRICE_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async ({ symbol, date, txList }) => {
        const dateStr = date.toISOString().slice(0, 10);
        onStatus?.(`Consultando ${symbol} @ ${dateStr}...`);
        try {
          const price = await getHistoricalPriceEur(symbol, date);
          completed++;
          if (price > 0) {
            onStatus?.(`✓ ${symbol} @ ${dateStr} = ${price.toFixed(4)} €`, completed, totalPairs);
            for (const tx of txList) {
              tx.pricePerUnit = price;
              tx.costAsset    = 'EUR';
              tx.costAmount   = tx.amount * price;
            }
          } else {
            onStatus?.(`— ${symbol} @ ${dateStr} sin precio`, completed, totalPairs);
          }
        } catch (e) {
          completed++;
          onStatus?.(`⚠ ${symbol} @ ${dateStr} error: ${(e as Error).message}`, completed, totalPairs);
        }
      })
    );
  }

  setCoinGeckoStatusCallback(undefined);
  onStatus?.(`Precios de rendimiento completados: ${totalPairs} pares procesados`);
}
