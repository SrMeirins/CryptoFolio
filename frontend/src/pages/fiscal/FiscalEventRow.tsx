import { formatEur, pnlColor } from '../../utils/format'
import { fiscalDateDetail, fiscalTypeLabel, formatFiscalDate, formatFiscalQty, type FiscalTone } from '../../utils/fiscalTable'
import { CryptoIcon } from '../../components/CryptoIcon'
import { PNL_THRESHOLD } from './constants'
import { EventWarnings } from './EventWarnings'
import type { FiscalEvent } from './types'
import { tableRowClasses } from '../../components/ui'

// Color del tipo de operación (#295): el texto también lo dice, el color solo refuerza.
const TONE_CLASS: Record<FiscalTone, string> = {
  sale:   'bg-brand/10 text-brand-ink',
  swap:   'bg-accent-purple/10 text-accent-purple',
  fee:    'bg-warning/10 text-warning',
  loss:   'bg-negative/10 text-negative-ink',
  margin: 'bg-overlay/8 text-fg-muted',
  other:  'bg-background-tertiary text-fg-muted',
}

function TypeBadge({ tipo }: { tipo: string }) {
  const type = fiscalTypeLabel(tipo)
  return <span className={`text-xs px-1.5 py-0.5 rounded-lg whitespace-nowrap ${TONE_CLASS[type.tone]}`}>{type.label}</span>
}

function FechaCell({ e }: { e: FiscalEvent }) {
  return <time dateTime={e.fechaHora ?? e.fecha} title={fiscalDateDetail(e.fechaHora)}>{formatFiscalDate(e.fecha)}</time>
}

function Operacion({ e }: { e: FiscalEvent }) {
  const isFee = fiscalTypeLabel(e.tipo).tone === 'fee'
  return (
    <div className="flex items-center gap-1 whitespace-nowrap min-w-0">
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
  )
}

function GananciaPerdida({ gp }: { gp: number }) {
  return Math.abs(gp) < PNL_THRESHOLD
    ? <span className="text-fg-subtle font-normal">0,00 €</span>
    : <>{gp > 0 ? '+' : ''}{formatEur(gp)}</>
}

export function FiscalEventRow({ e }: { e: FiscalEvent }) {
  const gp = e.gananciaPerdidaEur ?? 0
  return (
    <tr className={tableRowClasses()}>
      <td className="px-4 py-2.5 text-fg-muted text-xs whitespace-nowrap"><FechaCell e={e} /></td>
      <td className="px-4 py-2.5"><TypeBadge tipo={e.tipo} /></td>
      <td className="px-4 py-2.5 min-w-[140px]">
        <Operacion e={e} />
        <div className="text-xs text-fg-subtle mt-0.5">{e.wallet}</div>
      </td>
      <td className="px-4 py-2.5 text-right mono text-xs text-fg-subtle">{formatFiscalQty(e.cantidadTransmitida)}</td>
      {/* Clave AEAT compacta: la descripción va en el tooltip (#299) */}
      <td className="px-3 py-2.5 text-center">
        <abbr title={e.contrapartidaDescripcion} className="no-underline bg-background-tertiary px-1.5 py-0.5 rounded-lg text-fg mono text-xs cursor-help">{e.contrapartidaClave}</abbr>
      </td>
      {/* Valor con sus gastos debajo: 8 columnas en lugar de 10, el G/P siempre a la vista */}
      <td className="px-4 py-2.5 text-right mono whitespace-nowrap">
        {formatEur(e.valorTransmisionEur)}
        <div className="text-[11px] text-fg-subtle">− {formatEur(e.gastosTransmisionEur)} gastos</div>
      </td>
      <td className="px-4 py-2.5 text-right mono whitespace-nowrap">
        {formatEur(e.valorAdquisicionEur)}
        <div className="text-[11px] text-fg-subtle">+ {formatEur(e.gastosAdquisicionEur)} gastos</div>
      </td>
      <td className={`px-4 py-2.5 text-right mono font-bold whitespace-nowrap ${pnlColor(gp)}`}>
        {/* Avisos como iconos junto al resultado (#299) */}
        <span className="inline-flex items-center justify-end gap-1">
          <EventWarnings e={e} />
          <GananciaPerdida gp={gp} />
        </span>
      </td>
    </tr>
  )
}

/** Tarjeta de una operación para pantallas estrechas (#299). */
export function FiscalEventCard({ e }: { e: FiscalEvent }) {
  const gp = e.gananciaPerdidaEur ?? 0
  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-fg-muted"><FechaCell e={e} /><TypeBadge tipo={e.tipo} /></span>
        <span className={`inline-flex items-center gap-1 mono text-sm font-bold ${pnlColor(gp)}`}>
          <EventWarnings e={e} />
          <GananciaPerdida gp={gp} />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Operacion e={e} />
        <span className="mono text-xs text-fg-subtle">{formatFiscalQty(e.cantidadTransmitida)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div><dt className="text-fg-subtle">Transmisión</dt><dd className="mono text-fg">{formatEur(e.valorTransmisionEur)} <span className="text-fg-subtle">− {formatEur(e.gastosTransmisionEur)}</span></dd></div>
        <div><dt className="text-fg-subtle">Adquisición</dt><dd className="mono text-fg">{formatEur(e.valorAdquisicionEur)} <span className="text-fg-subtle">+ {formatEur(e.gastosAdquisicionEur)}</span></dd></div>
        <div className="col-span-2 text-fg-subtle truncate">{e.wallet} · <span className="mono">{e.contrapartidaClave}</span> {e.contrapartidaDescripcion}</div>
      </dl>
    </li>
  )
}
