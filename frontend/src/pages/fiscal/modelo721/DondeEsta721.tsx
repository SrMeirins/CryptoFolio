import { formatEur } from '../../../utils/format'
import { autocustodiaEur } from '../../../utils/modelo721View'
import type { Modelo721 } from '../types'

// Dónde está tu dinero para el 721 (#545): tres cifras, lo que computa (en
// exchanges fuera de España o sin saberlo), lo que está en exchanges en España
// y la autocustodia. Las dos últimas no computan; el texto lo dice, no el color.

export function DondeEsta721({ data }: { data: Modelo721 }) {
  const suma = (computa: boolean) => data.grupos.filter(g => g.computa === computa).reduce((s, g) => s + g.totalEur, 0)
  const min = data.incompleto ? 'al menos ' : ''
  const cifras = [
    { titulo: 'Fuera de España', nota: 'computa', valor: suma(true), destacada: true },
    { titulo: 'En exchanges en España', nota: 'no computa', valor: suma(false), destacada: false },
    { titulo: 'En autocustodia', nota: 'no computa', valor: autocustodiaEur(data), destacada: false },
  ]
  return (
    <section aria-labelledby="m721-donde">
      <h4 id="m721-donde" className="sr-only">Dónde está tu dinero</h4>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cifras.map(c => (
          <div key={c.titulo} className={`rounded-xl border px-3 py-2.5 ${c.destacada ? 'border-brand/40 bg-brand/5' : 'border-border'}`}>
            <dt className="text-xs text-fg-muted">{c.titulo} <span className="text-fg-subtle">({c.nota})</span></dt>
            <dd className={`mono tabular-nums mt-0.5 ${c.destacada ? 'text-lg font-semibold text-fg' : 'text-base text-fg-muted'}`}>
              {c.destacada ? min : ''}{formatEur(c.valor)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
