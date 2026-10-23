import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, type RunningBalance } from '../../../api/portfolio'
import { balanceAsset } from './balanceFormat'

// Saldo corrido del activo filtrado (#380): solo con un único activo. Cuelga
// de la clave 'transactions', así que se invalida con cualquier cambio en
// transacciones; conserva las cifras previas mientras recalcula.

export interface RunningBalanceView {
  asset: string
  walletFiltered: boolean
  data: RunningBalance | undefined
  byId: Map<string, { balance: number; missing: number | null }>
}

export function useRunningBalance(
  filters: { assets: readonly string[]; wallet_id: string; groupFees: boolean },
  ids: readonly string[],
): RunningBalanceView | null {
  const asset = balanceAsset(filters.assets)
  const params = asset
    ? { asset, wallet_id: filters.wallet_id || undefined, ids: [...ids], group_fees: filters.groupFees }
    : null
  const { data } = useQuery({
    queryKey: ['transactions', 'saldos', params],
    queryFn: () => portfolioApi.getRunningBalance(params!),
    enabled: !!params && ids.length > 0,
    placeholderData: prev => prev,
  })
  const byId = useMemo(() => new Map((data?.rows ?? []).map(r => [r.id, { balance: r.balance, missing: r.missing }])), [data])
  if (!asset) return null
  return { asset, walletFiltered: !!filters.wallet_id, data: data?.asset === asset ? data : undefined, byId }
}
