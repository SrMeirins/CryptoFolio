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
      <td className="px-4 py-2.5 mono text-gray-400 text-[11px]">{e.fecha}</td>
      <td className="px-4 py-2.5">
        {isFee ? (
          <span className="text-[10px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded">Fee</span>
        ) : isLost ? (
          <span className="text-[10px] bg-accent-red/10 text-accent-red px-1.5 py-0.5 rounded">Pérdida</span>
        ) : (
          <span className="text-[10px] bg-background-tertiary text-gray-400 px-1.5 py-0.5 rounded">{e.tipo}</span>
        )}
      </td>
      <td className="px-4 py-2.5 min-w-[140px]">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <CryptoIcon symbol={e.activoTransmitido} size={15} />
          <span className="font-bold mono text-[11px]">{e.activoTransmitido}</span>
          {e.activoRecibido ? (
            <>
              <span className="text-gray-600 text-[10px] mx-0.5">→</span>
              <CryptoIcon symbol={e.activoRecibido} size={15} />
              <span className="font-bold mono text-[11px]">{e.activoRecibido}</span>
            </>
          ) : isFee ? (
            <span className="text-gray-600 text-[10px]">→ fee</span>
          ) : null}
        </div>
        <div className="text-[10px] text-gray-600 mt-0.5">{e.wallet}</div>
        {e.permutaWrapStaking && (
          <div
            className="mt-0.5 inline-block text-[10px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded"
            title="El wrap/unwrap de ETH↔BETH (staking de ETH 2.0) se trata como permuta imponible: criterio conservador, sin doctrina de la DGT específica. Algunos asesores lo consideran no imponible al ser 1:1 sobre el mismo derecho. Valídalo con tu asesor."
          >
            ⚠ wrap de staking tratado como permuta imponible — criterio por validar
          </div>
        )}
        {e.lostSinMotivo && (
          <div
            className="mt-0.5 inline-block text-[10px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded"
            title="Esta pérdida se computa como 100% deducible, pero su deducibilidad real depende del motivo (estafa, exchange insolvente, clave perdida...). Añade el motivo en las notas de la transacción y valídalo con tu asesor."
          >
            ⚠ pérdida sin motivo anotado — deducibilidad por validar
          </div>
        )}
        {e.posiblePerdidaDiferida && (
          <div
            className="mt-0.5 inline-block text-[10px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded"
            title="Recompraste este activo en los 2 meses anteriores o posteriores a la venta con pérdida. Art. 33.5 LIRPF: la pérdida podría no ser computable ahora (aplicación a cripto no pacífica). Consúltalo con tu asesor."
          >
            ⚠ posible pérdida diferida (recompra ±2 meses)
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right mono text-[11px] text-gray-500">
        {formatQtyTransmitida(e.cantidadTransmitida)}
      </td>
      <td className="px-4 py-2.5">
        <span className="bg-background-tertiary px-1.5 py-0.5 rounded text-gray-300 font-mono text-[10px]">
          {e.contrapartidaClave}
        </span>
        <span className="ml-1.5 text-gray-500 text-[10px]">{e.contrapartidaDescripcion}</span>
      </td>
      <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorTransmisionEur)}</td>
      <td className="px-4 py-2.5 text-right mono text-gray-500">{formatEur(e.gastosTransmisionEur)}</td>
      <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorAdquisicionEur)}</td>
      <td className="px-4 py-2.5 text-right mono text-gray-500">{formatEur(e.gastosAdquisicionEur)}</td>
      <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(gp)}`}>
        {Math.abs(gp) < PNL_THRESHOLD
          ? <span className="text-gray-500 font-normal">0,00 €</span>
          : <>{gp > 0 ? '+' : ''}{formatEur(gp)}</>}
      </td>
    </tr>
  )
}
