import { Check, Clock } from 'lucide-react'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { formatAmount, type Currency } from '../../../utils/format'
import { edadCorta } from '../../../utils/positionMetrics'
import { valorResto, type FichaResto as Ficha } from '../../../utils/saldosResiduales'
import { ink } from '../../../utils/colors'

// Ficha de un saldo residual (#530): activo, wallet, cantidad, valor (nunca
// «0,00 €») y antigüedad, con la marca «Más de 1 año». Pulsarla abre el
// detalle del activo; en el modo de conversión, la selecciona. Una ficha de
// otra wallet distinta a la elegida queda deshabilitada (la conversión se
// hace dentro de una wallet).

export function FichaResto({ ficha, currency, seleccionando, seleccionada, deshabilitada, onPulsar }: {
  ficha: Ficha
  currency: Currency
  seleccionando: boolean
  seleccionada: boolean
  deshabilitada: boolean
  onPulsar: () => void
}) {
  const valor = valorResto(ficha.value, currency)
  const nombre = seleccionando
    ? `${ficha.asset} de ${ficha.walletName}${deshabilitada ? ', de otra wallet: no se puede convertir junto a los elegidos' : ''}`
    : `Ver detalle de ${ficha.asset} (resto en ${ficha.walletName})`
  return (
    <li>
      <button type="button" onClick={onPulsar} disabled={deshabilitada} aria-label={nombre}
        aria-pressed={seleccionando ? seleccionada : undefined} data-testid="ficha-resto"
        className={`relative w-full h-full text-left rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
          ${seleccionada ? 'border-brand bg-brand/8' : 'border-border bg-overlay/2 hover:bg-overlay/5'}
          ${deshabilitada ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {seleccionando && (
          <span aria-hidden="true" className={`absolute top-2 right-2 size-4 rounded border flex items-center justify-center ${seleccionada ? 'bg-brand border-brand text-white' : 'border-fg-subtle'}`}>
            {seleccionada && <Check size={11} />}
          </span>
        )}
        <span className="flex items-center gap-2 min-w-0 pr-5">
          <CryptoIcon symbol={ficha.asset} size={20} />
          <span className="text-sm font-semibold text-fg truncate">{ficha.asset}</span>
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] min-w-0">
          <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: ficha.walletColor }} aria-hidden="true" />
          <span className="truncate" style={{ color: ink(ficha.walletColor) }}>{ficha.walletName}</span>
        </span>
        <span className="mt-1.5 block mono tabular-nums text-xs text-fg-muted truncate">{formatAmount(ficha.quantity)}</span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs">
          <span className={`mono tabular-nums ${ficha.value > 1e-9 ? 'text-fg' : 'text-fg-subtle'}`}>{valor}</span>
          {ficha.ageDays !== null && <span className="text-[11px] text-fg-subtle whitespace-nowrap">{edadCorta(ficha.ageDays)}</span>}
        </span>
        {ficha.viejo && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-warning/12 px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">
            <Clock size={10} aria-hidden="true" /> Más de 1 año
          </span>
        )}
      </button>
    </li>
  )
}
