import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { buttonClasses, iconButtonClasses } from '../../../components/ui'
import { reglaDe, textoEstado, textoOrigen } from '../../../utils/custodia721'
import { formatEur } from '../../../utils/format'
import { formatFiscalQty } from '../../../utils/fiscalTable'
import { nombrePais } from '../../../utils/paises'
import type { Grupo721, Regla721 } from '../types'
import { CustodiaDialog } from './CustodiaDialog'
import { Reparto721 } from './Reparto721'

// Grupos del 721 por custodia (#545), separados en los que computan y los que
// no: cada entidad con sus wallets (las subcuentas de un exchange suman
// juntas), dónde está la custodia y cómo se sabe (automático, indicado por el
// usuario o no se sabe). La pregunta de las que no se saben está en «Te falta»;
// aquí, «Indicar» o «Cambiar» abren el diálogo de custodia.

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

const nombreDe = (g: Grupo721) => g.entidad?.nombre ?? g.wallets.map(w => w.nombre).join(', ')

/** Título del diálogo: el exchange si tiene regla automática; si no, la wallet o la entidad. */
function tituloDe(g: Grupo721, regla: Regla721 | null): string {
  if (regla) return regla.exchange
  return g.wallets.length === 1 ? g.wallets[0].nombre : nombreDe(g)
}

function Grupo({ g, reglas, onCambiar }: { g: Grupo721; reglas: readonly Regla721[]; onCambiar: (g: Grupo721, titulo: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const idDetalle = `m721-${g.clave.replace(/\W+/g, '-')}`
  const regla = reglaDe(reglas, g.wallets.find(w => w.regla)?.regla ?? null)
  const origenes = new Set(g.wallets.map(w => w.origen))
  const origen = origenes.size === 1 ? g.wallets[0].origen : null
  const desconocidas = g.wallets.filter(w => w.origen === 'desconocido')
  const nombre = nombreDe(g)
  const detalle = [
    g.entidad?.pais && g.entidad.pais !== 'ES' ? nombrePais(g.entidad.pais) : null,
    g.entidad?.nif ? `NIF ${g.entidad.nif}` : null,
  ].filter(Boolean).join(', ')

  return (
    <li className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap px-3 py-2.5">
        <button type="button" onClick={() => setAbierto(o => !o)} aria-expanded={abierto} aria-controls={idDetalle}
          aria-label={`${abierto ? 'Ocultar' : 'Ver'} las monedas de ${nombre}`} className={`${iconButtonClasses('sm')} ${FOCO}`}>
          <ChevronRight size={14} aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-90' : ''}`} />
        </button>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg truncate">{nombre}</span>
          <span className={`block text-[11px] ${g.enEspana === null ? 'text-warning-ink' : 'text-fg-subtle'}`}>
            {textoEstado(g.enEspana)}{detalle ? `, ${detalle}` : ''}
            {origen && origen !== 'desconocido' && <span className="text-fg-subtle">. {textoOrigen(origen, regla?.exchange ?? null)}</span>}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => onCambiar(g, tituloDe(g, regla))} aria-label={`Cambiar la custodia de ${nombre}`}
            className={buttonClasses('ghost', 'sm')}>{desconocidas.length === g.wallets.length ? 'Indicar' : 'Cambiar'}</button>
          <span className="text-right">
            <span className="block mono text-sm font-semibold text-fg tabular-nums">{formatEur(g.totalEur)}</span>
            <span className="block text-[11px] text-fg-subtle">{g.computa ? 'computa' : 'no computa'}</span>
          </span>
        </span>
      </div>

      {(g.wallets.length > 1 || g.entidad) && (
        <p className="px-3 pb-2 text-[11px] text-fg-subtle">
          {g.wallets.length === 1 ? 'Wallet' : 'Wallets'}: {g.wallets.map(w => w.nombre).join(', ')}
        </p>
      )}

      {abierto && (
        <table id={idDetalle} className="w-full text-xs border-t border-border">
          <caption className="sr-only">Monedas de {nombre}</caption>
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-fg-subtle bg-overlay/[0.04]">
              <th scope="col" className="text-left font-medium px-3 py-1.5">Moneda</th>
              <th scope="col" className="text-right font-medium px-3 py-1.5">Unidades</th>
              <th scope="col" className="text-right font-medium px-3 py-1.5">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {g.activos.map(a => (
              <tr key={a.asset}>
                <th scope="row" className="text-left font-normal px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5"><CryptoIcon symbol={a.asset} size={14} /><span className="mono font-semibold text-fg">{a.asset}</span></span>
                </th>
                <td className="text-right mono px-3 py-1.5 text-fg-muted">{formatFiscalQty(a.unidades)}</td>
                <td className="text-right mono px-3 py-1.5 text-fg">{a.sinPrecio ? <span className="text-warning-ink">sin precio</span> : formatEur(a.valorEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}

function Seccion({ titulo, grupos, reglas, onCambiar, children }: {
  titulo: string
  grupos: readonly Grupo721[]
  reglas: readonly Regla721[]
  onCambiar: (g: Grupo721, titulo: string) => void
  children?: ReactNode
}) {
  const id = useId()
  if (grupos.length === 0) return null
  const total = grupos.reduce((s, g) => s + g.totalEur, 0)
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h4 id={id} className="flex items-baseline justify-between gap-3 text-xs font-medium text-fg-muted">
        <span>{titulo}</span><span className="mono tabular-nums">{formatEur(total)}</span>
      </h4>
      {children}
      <ul className="space-y-2" aria-label={titulo}>
        {grupos.map(g => <Grupo key={g.clave} g={g} reglas={reglas} onCambiar={onCambiar} />)}
      </ul>
    </section>
  )
}

export function GruposEntidad({ grupos, reglas }: { grupos: readonly Grupo721[]; reglas: readonly Regla721[] }) {
  const [cambiar, setCambiar] = useState<{ titulo: string; wallets: { id: string; nombre: string }[] } | null>(null)
  const onCambiar = (x: Grupo721, titulo: string) => setCambiar({ titulo, wallets: x.wallets.map(w => ({ id: w.id, nombre: w.nombre })) })
  const computan = grupos.filter(g => g.computa)
  return (
    <div className="space-y-4">
      <Seccion titulo="Computan para el 721" grupos={computan} reglas={reglas} onCambiar={onCambiar}>
        <Reparto721 grupos={computan} />
      </Seccion>
      <Seccion titulo="No computan" grupos={grupos.filter(g => !g.computa)} reglas={reglas} onCambiar={onCambiar} />
      {cambiar && <CustodiaDialog titulo={cambiar.titulo} wallets={cambiar.wallets} onClose={() => setCambiar(null)} />}
    </div>
  )
}
