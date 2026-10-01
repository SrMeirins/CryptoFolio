import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { AssetTable } from '../../components/AssetTable'

const KIND_LABEL: Record<string, string> = {
  exchange: 'Exchange',
  hardware: 'Hardware',
  cold:     'Frío',
  hot:      'Caliente',
}

// Una sección por cada wallet real, en orden: frías primero, exchanges al final.
export function WalletSections({ lots, fiatBalances, onSimulate }: {
  lots: FifoLot[]
  fiatBalances: FiatBalance[]
  onSimulate: (asset: string, qty: number, price: number) => void
}) {
  const walletOrder: string[] = []
  const seen = new Set<string>()

  // 1. Wallets frías
  for (const lot of lots) {
    if (lot.wallet_kind !== 'exchange' && !seen.has(lot.wallet_id)) {
      walletOrder.push(lot.wallet_id)
      seen.add(lot.wallet_id)
    }
  }
  // 2. Exchanges
  for (const lot of lots) {
    if (lot.wallet_kind === 'exchange' && !seen.has(lot.wallet_id)) {
      walletOrder.push(lot.wallet_id)
      seen.add(lot.wallet_id)
    }
  }
  // 3. Wallets que solo tienen fiat (sin lotes cripto)
  for (const b of fiatBalances) {
    if (!seen.has(b.wallet_id)) {
      walletOrder.push(b.wallet_id)
      seen.add(b.wallet_id)
    }
  }

  const groups = walletOrder.map(wid => {
    const wLots = lots.filter(l => l.wallet_id === wid)
    const wFiat = fiatBalances.filter(b => b.wallet_id === wid)
    // walletOrder solo incluye IDs que aparecen en lots o fiatBalances, así
    // que uno de los dos [0] siempre existe — el fallback a '' es defensivo,
    // no se espera que se use en la práctica.
    return {
      key:   wid,
      name:  wLots[0]?.wallet_name  ?? wFiat[0]?.wallet_name  ?? '',
      color: wLots[0]?.wallet_color ?? wFiat[0]?.wallet_color ?? '',
      kind:  wLots[0]?.wallet_kind  ?? wFiat[0]?.wallet_kind  ?? '',
      lots:  wLots,
      fiats: wFiat,
      assetCount: new Set(wLots.map(l => l.asset)).size,
    }
  })

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <div key={g.key} className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: g.color }}>
              {g.name}
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium uppercase tracking-wide text-gray-600 border-gray-700/60">
              {KIND_LABEL[g.kind] ?? g.kind}
            </span>
            {g.assetCount > 0 && (
              <span className="text-xs text-gray-600">
                {g.assetCount} activo{g.assetCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <AssetTable lots={g.lots} fiatBalances={g.fiats} onSimulate={onSimulate} />
        </div>
      ))}
    </div>
  )
}
