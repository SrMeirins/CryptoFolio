import type { WalletFull } from '../../api/portfolio'
import type { PreviewTransaction } from './types'

// Direcciones de destino de los retiros en la revisión (#320). Lógica pura.

const EVM_RE = /^0x[0-9a-fA-F]{40}$/

/** Forma canónica para comparar: EVM sin mayúsculas (el checksum solo cambia el caso); el resto, exacta. */
export function normalizarDireccion(address: string): string {
  const v = address.trim()
  return EVM_RE.test(v) ? v.toLowerCase() : v
}

/** «rN7n…Xk2p»: lo bastante para reconocerla, completa en el tooltip. */
export function abreviarDireccion(address: string, cabeza = 6, cola = 4): string {
  return address.length <= cabeza + cola + 1 ? address : `${address.slice(0, cabeza)}…${address.slice(-cola)}`
}

/**
 * URL del explorador a partir de la plantilla de la red. Solo https y con el
 * valor codificado: una plantilla o un valor manipulados no producen un enlace
 * javascript: ni cambian de dominio.
 */
export function urlExplorador(plantilla: string | null | undefined, marcador: '{address}' | '{tx_hash}', valor: string | null | undefined): string | null {
  if (!plantilla || !valor || !plantilla.startsWith('https://') || !plantilla.includes(marcador)) return null
  return plantilla.replace(marcador, encodeURIComponent(valor))
}

export interface GrupoDireccion {
  clave: string
  address: string
  networkId: string | null
  network: string | null
  txs: PreviewTransaction[]
}

/** Retiros con dirección agrupados por dirección canónica; el resto, aparte. */
export function agruparPorDireccion(retiros: PreviewTransaction[]): { grupos: GrupoDireccion[]; sinDireccion: PreviewTransaction[] } {
  const porClave = new Map<string, GrupoDireccion>()
  const sinDireccion: PreviewTransaction[] = []
  for (const tx of retiros) {
    const address = tx.destino?.address
    if (!address) { sinDireccion.push(tx); continue }
    const clave = normalizarDireccion(address)
    const g = porClave.get(clave)
    if (g) {
      g.txs.push(tx)
      if (!g.networkId && tx.destino?.networkId) { g.networkId = tx.destino.networkId; g.network = tx.destino.network }
    } else {
      porClave.set(clave, { clave, address, networkId: tx.destino?.networkId ?? null, network: tx.destino?.network ?? null, txs: [tx] })
    }
  }
  const primera = (g: GrupoDireccion) => Math.min(...g.txs.map(t => new Date(t.timestamp).getTime()))
  return { grupos: [...porClave.values()].sort((a, b) => primera(a) - primera(b)), sinDireccion }
}

export interface WalletReconocida { id: string; name: string; color: string }

/** Dirección canónica → wallet propia que la tiene guardada. */
export function walletsPorDireccion(wallets: Pick<WalletFull, 'id' | 'name' | 'color' | 'type' | 'addresses'>[]): Map<string, WalletReconocida> {
  const out = new Map<string, WalletReconocida>()
  for (const w of wallets) {
    if (w.type === 'exchange') continue
    for (const a of w.addresses ?? []) {
      if (a.address) out.set(normalizarDireccion(a.address), { id: w.id, name: w.name, color: w.color })
    }
  }
  return out
}

/** ¿La primera línea del archivo es la del historial de retiradas de Binance? */
export function esCabeceraRetiradas(primeraLinea: string): boolean {
  const cols = new Set(primeraLinea.replace(/^\uFEFF/, '').split(',').map(c => c.trim().replace(/^"|"$/g, '')))
  return ['Time', 'Coin', 'Network', 'Amount', 'Fee', 'Address', 'TXID', 'Status'].every(c => cols.has(c))
}

/** Lee la cabecera del archivo para saber si es el historial de retiradas (#320). */
export async function esArchivoRetiradas(file: File): Promise<boolean> {
  const primera = (await file.slice(0, 4096).text()).split(/\r?\n/)[0] ?? ''
  return esCabeceraRetiradas(primera)
}
