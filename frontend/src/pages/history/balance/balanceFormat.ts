import { formatAmount, formatNumber } from '../../../utils/format'

// Textos del saldo corrido (#380). Funciones puras.

/** Activo único filtrado (en mayúsculas) o null si hay ninguno o varios. */
export function balanceAsset(assets: readonly string[]): string | null {
  return assets.length === 1 ? assets[0].toUpperCase() : null
}

/** «3.087,53 XRP»: cantidad con los decimales de la app según su magnitud, y activo. */
export function formatBalance(amount: number, asset: string): string {
  return `${formatAmount(amount, 8)} ${asset}`
}

/** Aviso de hueco de una fila, legible también por lector de pantalla. */
export function shortfallText(missing: number, asset: string): string {
  return `Faltaban ${formatAmount(missing, 8)} ${asset}: posible importación incompleta`
}

/** Resumen de huecos del activo. */
export function shortfallSummary(count: number, asset: string): string {
  return `${formatNumber(count, 0)} ${count === 1 ? 'operación' : 'operaciones'} de ${asset} sin saldo suficiente`
}
