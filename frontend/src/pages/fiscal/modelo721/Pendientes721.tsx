import { ListTodo } from 'lucide-react'
import { pendingPricesText } from '../../../utils/modelo721Status'
import type { Modelo721 } from '../types'
import { PreguntaCustodia } from './PreguntaCustodia'
import { PresentadoBloque } from './PresentadoBloque'

// Lo que te falta en el 721 (#545): responder dónde está la custodia de las
// wallets que no se saben, los precios que aún faltan y, si tenías que
// presentarlo en un año cerrado, marcarlo como presentado. Sin nada, no se ve.

export function Pendientes721({ data, year }: { data: Modelo721; year: number }) {
  const precios = pendingPricesText(data.preciosPendientes)
  const marcar = !data.esAnioEnCurso && !data.presentado && data.veredicto.obligado === true
  if (data.sinCustodia.length === 0 && !precios && !marcar) return null
  return (
    <section aria-labelledby="m721-falta" className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-3 space-y-2.5">
      <h4 id="m721-falta" className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <ListTodo size={14} aria-hidden="true" className="text-warning-ink" /> Te falta
      </h4>
      {data.sinCustodia.map(w => <PreguntaCustodia key={w.id} wallet={w} />)}
      {precios && <p role="status" className="text-xs text-fg-muted">{precios}: los totales son un mínimo hasta que las fuentes de precios respondan.</p>}
      {marcar && <PresentadoBloque data={data} year={year} />}
    </section>
  )
}
