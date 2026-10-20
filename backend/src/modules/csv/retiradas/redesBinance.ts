// Código de red del historial de retiradas de Binance → nombre de la red en la
// app (tabla networks) (#320). Solo las redes que la app conoce; una red sin
// traducir deja el retiro sin red y el usuario la elige al guardar la dirección.
// DOT se omite a propósito: la red relay no es «Polkadot Asset Hub».
const RED_BINANCE: Record<string, string> = {
  XRP: 'XRP Ledger',
  ETH: 'Ethereum',
  BSC: 'BNB Chain',
  SOL: 'Solana',
  ADA: 'Cardano',
  HBAR: 'HBAR',
  XLM: 'Stellar',
  STATEMINT: 'Polkadot Asset Hub',
  BTC: 'Bitcoin',
  AVAXC: 'Avalanche',
  TRX: 'Tron',
};

export function redDeBinance(codigo: string | undefined | null): string | null {
  return RED_BINANCE[(codigo ?? '').trim().toUpperCase()] ?? null;
}
