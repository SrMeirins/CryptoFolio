import { StatStrip, type StatStripCell } from '../../../components/ui'
import type { Currency } from '../../../utils/format'
import type { Racha, ResumenPeriodo } from '../../../utils/pnlPeriodo'
import { fechaCorta } from '../../../utils/rangoGrafico'
import { signedMoney } from '../calendar/format'
import { diasTexto, fechasRacha } from '../../../utils/pnlPeriodoTexto'

// Tira del periodo del panel P&L diario (#511, StatStrip de #490): mejor y
// peor día (abren su detalle en el calendario), racha verde y roja más largas
// con su duración y fechas, y día verde medio frente a rojo medio. Solo días
// cerrados.

export function TiraPeriodo({ resumen, currency, onOpenDay }: {
  resumen: ResumenPeriodo
  currency: Currency
  /** Abre el día en el calendario con su detalle. */
  onOpenDay?: (date: string) => void
}) {
  const { mejor, peor, rachaVerde, rachaRoja, mediaVerde, mediaRoja, verdes, rojos } = resumen
  const abrir = (date: string | undefined) => (date && onOpenDay ? { onSelect: () => onOpenDay(date), destination: 'el calendario' } : {})
  const racha = (key: string, label: string, r: Racha | null, tone: 'positive' | 'negative'): StatStripCell => ({
    key, label, tone: r ? tone : undefined, value: r ? diasTexto(r.dias) : '—', sub: r ? fechasRacha(r) : 'Sin días',
  })
  const celdas: StatStripCell[] = [
    { key: 'mejor', label: 'Mejor día', tone: mejor ? 'positive' : undefined, value: mejor ? signedMoney(mejor.pnl, currency) : '—',
      sub: mejor ? fechaCorta(mejor.date) : 'Sin días en verde', ...abrir(mejor?.date) },
    { key: 'peor', label: 'Peor día', tone: peor ? 'negative' : undefined, value: peor ? signedMoney(peor.pnl, currency) : '—',
      sub: peor ? fechaCorta(peor.date) : 'Sin días en rojo', ...abrir(peor?.date) },
    racha('racha-verde', 'Racha verde', rachaVerde, 'positive'),
    racha('racha-roja', 'Racha roja', rachaRoja, 'negative'),
    { key: 'media-verde', label: 'Día verde medio', tone: mediaVerde !== null ? 'positive' : undefined,
      value: mediaVerde !== null ? signedMoney(mediaVerde, currency) : '—', sub: `Media de ${diasTexto(verdes)}` },
    { key: 'media-roja', label: 'Día rojo medio', tone: mediaRoja !== null ? 'negative' : undefined,
      value: mediaRoja !== null ? signedMoney(mediaRoja, currency) : '—', sub: `Media de ${diasTexto(rojos)}` },
  ]
  return <StatStrip cells={celdas} label="Métricas del periodo del P&L diario" columnas={6} />
}
