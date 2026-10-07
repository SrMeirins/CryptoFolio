// Orquestador: reexporta las 3 sub-áreas en que se fragmentó este módulo
// (cliente HTTP+rate-limit, gestión de IDs, resolución de precios), para que
// los puntos de import existentes (binance.ts, pairDetector.ts, routes/) no
// necesiten cambiar.
export { setCoinGeckoStatusCallback } from './coingeckoClient';

export {
  loadAssetMetadata,
  repairMissingCoinGeckoIds,
  searchCoinGeckoBySymbol,
  searchAndSaveCoinGeckoId,
  updateCoinGeckoId,
  verifyCoinGeckoId,
} from './coingeckoIds';

export {
  getHistoricalPriceEur,
  getCurrentPricesEur,
  prefetchHistoricalPrices,
  fetchMarketChart,
} from './coingeckoPrices';
