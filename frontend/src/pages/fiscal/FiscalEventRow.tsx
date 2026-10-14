import { formatEur, pnlColor } from '../../utils/format'
import { CryptoIcon } from '../../components/CryptoIcon'
import { PNL_THRESHOLD } from './constants'
import type { FiscalEvent } from './types'

const FEE_TYPES  = ['FEE_EXCHANGE', 'FEE_NETWORK', 'FEE']
const LOST_TYPES = ['LOST', 'GIFT_SENT']

function formatQtyTransmitida(qty: number): string {
  if (qty < 0.01) return qty.toExponential(2)
  if (qty >= 1000) return qty.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (qty >= 1) return qty.toFixed(4)
  return qty.toFixed(6)
}

export function FiscalEventRow({ e }: { e: FiscalEvent }) {
  const gp     = e.gananciaPerdidaEur ?? 0
  const isFee  = FEE_TYPES.includes(e.tipo)
  const isLost = LOST_TYPES.includes(e.tipo)

  return (
    <tr className="hover:bg-background-tertiary/40 transition-colors">
      <td className="px-4 py-2.5 mono text-fg-muted text-xs">{e.fecha}</td>
      <td className="px-4 py-2.5">
        {isFee ? (
          <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-lg">Fee</span>
        ) : isLost ? (
          <span className="text-xs bg-negative/10 text-negative px-1.5 py-0.5 rounded-lg">Pérdida</span>
        ) : (
          <span className="text-xs bg-background-tertiary text-fg-muted px-1.5 py-0.5 rounded-lg">{e.tipo}</span>
        )}
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
            <span className="text-fg-subtle text-xs">→ fee</span>
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
        {formatQtyTransmitida(e.cantidadTransmitida)}
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
