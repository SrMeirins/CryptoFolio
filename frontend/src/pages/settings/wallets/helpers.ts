import { Shield, Smartphone, Building2, Landmark } from 'lucide-react'
import type { Network } from '../../../api/portfolio'

export const OTHER_NETWORK = '__other__'

export const COLORS = ['#6366f1', '#00c896', '#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#1abc9c', '#e67e22']

export const WALLET_TYPE_META: Record<string, { icon: typeof Shield; label: string }> = {
  hardware:  { icon: Shield,    label: 'Hardware' },
  software:  { icon: Smartphone,label: 'Software' },
  exchange:  { icon: Building2, label: 'Exchange' },
  bank:      { icon: Landmark,  label: 'Banco / Fiat' },
  custodial: { icon: Building2, label: 'Custodial' },
}

export function truncateAddress(addr: string) {
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

export const SYNC_BADGE: Record<'ok' | 'discrepancy' | 'error' | 'pending', { label: string; className: string }> = {
  ok:          { label: 'Verificado', className: 'bg-accent-green/15 text-accent-green' },
  discrepancy: { label: 'Revisar',    className: 'bg-accent-amber/15 text-accent-amber' },
  error:       { label: 'Sin conexión', className: 'bg-accent-red/15 text-accent-red' },
  pending:     { label: 'Pendiente',  className: 'bg-gray-700/30 text-gray-500' },
}

export const NETWORKS_REQUIRING_KEY = ['Ethereum', 'Cardano', 'Polkadot Asset Hub']

export function getAddressPlaceholder(network: Network | undefined): string {
  if (!network) return 'Pega tu dirección pública...'
  const asset = network.native_asset.toUpperCase()
  const name  = network.name.toLowerCase()
  if (['ETH','BNB','MATIC','POL','CRO','AVAX','FTM','ETC'].includes(asset) ||
      name.includes('arbitrum') || name.includes('optimism') || name.includes('base'))
    return '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  if (asset === 'BTC') return 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
  if (asset === 'XRP') return 'rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe'
  if (asset === 'SOL') return '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
  if (asset === 'ADA') return 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer...'
  if (asset === 'DOT' || asset === 'KSM') return '1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg'
  if (asset === 'ATOM') return 'cosmos1yw6g44c4pqd2rxgrcqekxg9k8f4fd8xpab7ase'
  if (asset === 'XLM') return 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV5UOIQJOHNHKN'
  return 'Pega tu dirección pública...'
}

// Compartido por AddAddressForm y AddWalletForm — antes declarado por
// duplicado e idéntico en ambos.
export const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"
