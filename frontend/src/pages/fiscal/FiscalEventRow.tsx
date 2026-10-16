import { formatEur, pnlColor } from '../../utils/format'
import { fiscalDateDetail, fiscalTypeLabel, formatFiscalDate, formatFiscalQty, type FiscalTone } from '../../utils/fiscalTable'
import { CryptoIcon } from '../../components/CryptoIcon'
import { PNL_THRESHOLD } from './constants'
import type { FiscalEvent } from './types'
import { tableRowClasses } from '../../components/ui'

// Color del tipo de operación (#295): el texto también lo dice, el color solo refuerza.
const TONE_CLASS: Record<FiscalTone, string> = {
  sale:   'bg-brand/10 text-brand',
  swap:   'bg-accent-purple/10 text-accent-purple',
  fee:    'bg-warning/10 text-warning',
  loss:   'bg-negative/10 text-negative',
  margin: 'bg-overlay/8 text-fg-muted',
  other:  'bg-background-tertiary text-fg-muted',
}

export function FiscalEventRow({ e }: { e: FiscalEvent }) {
  const gp     = e.gananciaPerdidaEur ?? 0
  const type   = fiscalTypeLabel(e.tipo)
  const isFee  = type.tone === 'fee'

  return (
    <tr className={tableRowClasses()}>
      <td className="px-4 py-2.5 text-fg-muted text-xs whitespace-nowrap">
        <time dateTime={e.fechaHora ?? e.fecha} title={fiscalDateDetail(e.fechaHora)}>{formatFiscalDate(e.fecha)}</time>
      </td>
      <td className="px-4 py-2.5">
        <span className={`text-xs px-1.5 py-0.5 rounded-lg whitespace-nowrap ${TONE_CLASS[type.tone]}`}>{type.label}</span>
      </td>
      <td className="px-4 py-2.5 min-w-[140px]">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <CryptoIcon symbol={e.activoTransmitido} size={15} />
          <span className="font-bold mono text-xs">{e.activoTransmitido}</span>
          {e.activoRecibido ? (
            <>
              <span className="text-fg-subtle text-xs mx-0.5">→</span>
              <CryptoIcon symbol={e.activoRecibido} size={15} />
              <span className="font-bold mono text-xs">{e.activoRecibido}</span>
            </>
          ) : isFee ? (
            <span className="text-fg-subtle text-xs">→ comisión</span>
          ) : null}
        </div>
        <div className="text-xs text-fg-subtle mt-0.5">{e.wallet}</div>
        {e.permutaWrapStaking && (
          <div
            className="mt-0.5 inline-block text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-lg"
            title="El wrap/unwrap de ETH↔BETH (staking de ETH 2.0) se trata como permuta imponible: criterio conservador, sin doctrina de la DGT específica. Algunos asesores lo consideran no imponible al ser 1:1 sobre el mismo derecho. Valídalo con tu asesor."
          >
            ⚠ wrap de staking tratado como permuta imponible — criterio por validar
          </div>
        )}
        {e.lostSinMotivo && (
          <div
            className="mt-0.5 inline-block text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-lg"
            title="Esta pérdida se computa como 100% deducible, pero su deducibilidad real depende del motivo (estafa, exchange insolvente, clave perdida...). Añade el motivo en las notas de la transacción y valídalo con tu asesor."
          >
            ⚠ pérdida sin motivo anotado — deducibilidad por validar
          </div>
        )}
        {e.posiblePerdidaDiferida && (
          <div
            className="mt-0.5 inline-block text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-lg"
            title="Recompraste este activo en los 2 meses anteriores o posteriores a la venta con pérdida. Art. 33.5 LIRPF: la pérdida podría no ser computable ahora (aplicación a cripto no pacífica). Consúltalo con tu asesor."
          >
            ⚠ posible pérdida diferida (recompra ±2 meses)
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right mono text-xs text-fg-subtle">
        {formatFiscalQty(e.cantidadTransmitida)}
      </td>
      <td className="px-4 py-2.5">
        <span className="bg-background-tertiary px-1.5 py-0.5 rounded-lg text-fg mono text-xs">
          {e.contrapartidaClave}
        </span>
        <span className="ml-1.5 text-fg-subtle text-xs">{e.contrapartidaDescripcion}</span>
      </td>
      <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorTransmisionEur)}</td>
      <td className="px-4 py-2.5 text-right mono text-fg-subtle">{formatEur(e.gastosTransmisionEur)}</td>
      <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorAdquisicionEur)}</td>
      <td className="px-4 py-2.5 text-right mono text-fg-subtle">{formatEur(e.gastosAdquisicionEur)}</td>
      <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(gp)}`}>
        {Math.abs(gp) < PNL_THRESHOLD
          ? <span className="text-fg-subtle font-normal">0,00 €</span>
          : <>{gp > 0 ? '+' : ''}{formatEur(gp)}</>}
      </td>
    </tr>
  )
}
