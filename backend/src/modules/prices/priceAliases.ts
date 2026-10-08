// Tokens cuyo precio es equivalente al de otro activo (1:1 o redemption peg).
// Se resuelven antes de tocar caché o APIs externas.
export const PRICE_ALIASES: Record<string, string> = {
  'BETH':  'ETH',   // Binance staked ETH (1:1 ETH, retirado en 2023)
  'WETH':  'ETH',   // Wrapped ETH
  'WBTC':  'BTC',   // Wrapped BTC
  'BTCB':  'BTC',   // Binance-pegged BTC
};
