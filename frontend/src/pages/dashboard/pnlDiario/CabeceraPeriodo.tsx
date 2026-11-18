import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatPercent, type Currency } from '../../../utils/format'
import type { ResumenPeriodo } from '../../../utils/pnlPeriodo'
import { signedMoney } from '../calendar/format'
import { textoDias, textoDiasCerrados } from '../../../utils/pnlPeriodoTexto'

// Cabecera del periodo del panel P&L diario (#511): el acumulado en grande con
// su % sobre el capital (el mismo que Evolución) y una barra proporcional de
// días verdes, rojos y planos con sus recuentos en texto (el color nunca va
// solo). Los recuentos son de días cerrados: hoy no cuenta hasta que cierra.

export function CabeceraPeriodo({ resumen, pct, currency, conHoy }: {
  resumen: ResumenPeriodo
  /** % del periodo sobre el capital aportado; null si no hay base suficiente. */
  pct: number | null
  currency: Currency
  /** El periodo incluye el día en curso (su importe aún cambia). */
  conHoy: boolean
}) {
  const { total, verdes, rojos, planos } = resumen
  const dias = verdes + rojos + planos
  const Icono = total >= 0 ? TrendingUp : TrendingDown
  const color = total > 0 ? 'text-positive' : total < 0 ? 'text-negative' : 'text-fg'
  return (
    <div data-testid="cabecera-pnl-periodo" className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-widest text-fg-subtle">Acumulado del periodo{conHoy ? ', con hoy en vivo' : ''}</p>
        <p className={`mt-1 flex items-baseline gap-2 mono tabular-nums ${color}`}>
          <Icono size={20} aria-hidden="true" className="self-center shrink-0" />
          <span className="text-3xl font-bold tracking-tight">{signedMoney(total, currency)}</span>
          {pct !== null && <span className="text-sm font-semibold">{formatPercent(pct, 2, true)}</span>}
        </p>
      </div>
      {dias > 0 && (
        <div className="flex-1 min-w-0 sm:max-w-md sm:ml-auto">
          <div aria-hidden="true" className="flex h-2.5 rounded-full overflow-hidden bg-overlay/6 gap-px">
            {verdes > 0 && <span className="bg-positive transition-[flex-grow] duration-500" style={{ flexGrow: verdes }} />}
            {planos > 0 && <span className="bg-fg-subtle/40 transition-[flex-grow] duration-500" style={{ flexGrow: planos }} />}
            {rojos > 0 && <span className="bg-negative transition-[flex-grow] duration-500" style={{ flexGrow: rojos }} />}
          </div>
          <p className="mt-1.5 flex justify-between gap-3 text-[11px] text-fg-muted">
            <span className="sr-only">{textoDias(resumen)}, sin contar hoy.</span>
            <span aria-hidden="true"><span className="text-positive-ink font-semibold mono">{verdes}</span> en verde</span>
            <span aria-hidden="true" className="text-fg-subtle">{Math.round((verdes / dias) * 100)} % de {textoDiasCerrados(dias)}</span>
            <span aria-hidden="true"><span className="text-negative-ink font-semibold mono">{rojos}</span> en rojo</span>
          </p>
        </div>
      )}
    </div>
  )
}
