import { formatEur, pnlColor } from '../../utils/format'
import { fiscalDateDetail, fiscalTypeLabel, formatFiscalDate, type FiscalTone } from '../../utils/fiscalTable'
import { CryptoIcon } from '../../components/CryptoIcon'
import { PNL_THRESHOLD } from './constants'
import type { FiscalEvent } from './types'
import { necesitaRevision } from '../../utils/fiscalOperations'
import { parTexto } from '../../utils/operacionesTabla'
import { Tooltip, TextTooltip } from '../../components/ui'

// Celdas comunes de la tabla de Operaciones (#299, #543): clave de la casilla
// 1800, tipo, fecha, par y resultado. Las usan la fila de operación, la de
// microoperaciones y las tarjetas en pantallas estrechas.

/** Clave de la casilla 1800 (#531): la letra, o «Revisar» si no hay una segura; el significado, en el tooltip. */
export function ClaveCell({ e }: { e: FiscalEvent }) {
  const revisar = necesitaRevision(e)
  return (
    <Tooltip label={revisar ? 'Clave por revisar' : `Clave ${e.contrapartidaClave}`}
      triggerLabel={revisar ? `Clave por revisar: ${e.contrapartidaDescripcion}` : `Clave ${e.contrapartidaClave}: ${e.contrapartidaDescripcion}`}
      triggerClassName={`px-1.5 py-0.5 rounded-lg text-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${revisar ? 'bg-warning/12 text-warning-ink' : 'bg-background-tertiary text-fg mono'}`}
      trigger={revisar ? 'Revisar' : e.contrapartidaClave}>
      {e.contrapartidaDescripcion}
    </Tooltip>
  )
}

// Color del tipo de operación (#295): el texto también lo dice, el color solo refuerza.
const TONE_CLASS: Record<FiscalTone, string> = {
  sale:   'bg-brand/10 text-brand-ink',
  swap:   'bg-accent-purple/10 text-accent-purple',
  fee:    'bg-warning/10 text-warning-ink',
  loss:   'bg-negative/10 text-negative-ink',
  margin: 'bg-overlay/8 text-fg-muted',
  other:  'bg-background-tertiary text-fg-muted',
}

export function TypeBadge({ tipo, recibido }: { tipo: string; recibido: string | null }) {
  const type = fiscalTypeLabel(tipo, recibido)
  return <span className={`text-[11px] px-1.5 py-0.5 rounded-lg whitespace-nowrap ${TONE_CLASS[type.tone]}`}>{type.label}</span>
}

export function FechaCell({ e }: { e: Pick<FiscalEvent, 'fecha' | 'fechaHora'> }) {
  return <time dateTime={e.fechaHora ?? e.fecha}><TextTooltip label="Fecha y hora" tip={fiscalDateDetail(e.fechaHora)}>{formatFiscalDate(e.fecha)}</TextTooltip></time>
}

/** Par «BTC por EUR» con el icono del activo transmitido (#543). */
export function ParCell({ e }: { e: Pick<FiscalEvent, 'activoTransmitido' | 'activoRecibido' | 'tipo'> }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
      <CryptoIcon symbol={e.activoTransmitido} size={16} />
      <span className="font-medium text-fg">{parTexto(e)}</span>
    </span>
  )
}

export function Resultado({ gp }: { gp: number }) {
  return Math.abs(gp) < PNL_THRESHOLD
    ? <span className="text-fg-subtle font-normal">0,00 €</span>
    : <span className={pnlColor(gp)}>{gp > 0 ? '+' : ''}{formatEur(gp)}</span>
}
