import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, CalendarClock, CalendarRange, Check, Copy, Undo2 } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { cardClasses } from '../../components/ui'
import { formatNumber } from '../../utils/format'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { LineaTiempo } from './LineaTiempo'
import { ExchangeBadge } from './ExchangeBadge'
import { fechasParaCopiar, rangoExportar } from './coberturaVista'
import type { CoberturaExchange, HuecoCobertura } from './types'

const NOMBRE = { binance: 'Binance', bitvavo: 'Bitvavo' } as const

function Accion({ onClick, icon: Icon, children }: { onClick: () => void; icon: typeof Copy; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-brand hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">
      <Icon size={11} aria-hidden="true" />{children}
    </button>
  )
}

// Un hueco o el pendiente: qué exportar, guía, copiar fechas y «No operé en ese periodo».
function Tramo({ c, h, tipo, onVerGuia }: { c: CoberturaExchange; h: HuecoCobertura; tipo: 'hueco' | 'pendiente'; onVerGuia: (ex: 'binance' | 'bitvavo') => void }) {
  const qc = useQueryClient()
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refrescar = () => Promise.all([qc.invalidateQueries({ queryKey: ['cobertura'] }), qc.invalidateQueries({ queryKey: ['notifications'] })])

  async function revisar() {
    setError(null)
    try { await portfolioApi.revisarCobertura({ exchange: c.exchange, tipo, desde: h.desde, hasta: h.hasta }); await refrescar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
  }
  async function deshacer() {
    if (!h.revisionId) return
    setError(null)
    try { await portfolioApi.deshacerRevisionCobertura(h.revisionId); await refrescar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo deshacer') }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(fechasParaCopiar(h)); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sin portapapeles */ }
  }

  const titulo = tipo === 'pendiente'
    ? <>Pendiente de importar desde el {formatFiscalDate(h.desde)} hasta hoy <span className="text-fg-subtle">({h.dias} días)</span></>
    : <>Sin transacciones del {formatFiscalDate(h.desde)} al {formatFiscalDate(h.hasta)} <span className="text-fg-subtle">({h.dias} días)</span></>

  return (
    <li className={`flex items-start gap-2 text-xs ${h.revisionId ? 'opacity-70' : ''}`}>
      {tipo === 'pendiente'
        ? <CalendarClock size={13} className={`shrink-0 mt-0.5 ${h.revisionId ? 'text-fg-subtle' : 'text-warning'}`} aria-hidden="true" />
        : <CalendarRange size={13} className={`shrink-0 mt-0.5 ${h.revisionId ? 'text-fg-subtle' : 'text-warning'}`} aria-hidden="true" />}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-fg-muted">{titulo}</p>
        {h.revisionId ? (
          <p className="flex items-center gap-2 text-fg-subtle">
            <Check size={11} aria-hidden="true" /> {tipo === 'pendiente' ? 'Marcado: no has operado desde entonces' : 'Revisado: no operaste en ese periodo'}
            <Accion onClick={() => { void deshacer() }} icon={Undo2}>Deshacer</Accion>
          </p>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-fg-subtle">Exporta {NOMBRE[c.exchange]} {rangoExportar(h)}</span>
            <Accion onClick={() => { void copiar() }} icon={copiado ? Check : Copy}>{copiado ? 'Fechas copiadas' : 'Copiar fechas'}</Accion>
            <Accion onClick={() => onVerGuia(c.exchange)} icon={BookOpen}>Ver guía</Accion>
            <Accion onClick={() => { void revisar() }} icon={Check}>{tipo === 'pendiente' ? 'No he operado desde entonces' : 'No operé en ese periodo'}</Accion>
          </div>
        )}
        {error && <p role="alert" className="text-negative">{error}</p>}
      </div>
    </li>
  )
}

// Panel «Cobertura» del paso Subir (#328): por exchange, qué está importado, los
// huecos entre exportaciones y lo pendiente hasta hoy, con la intensidad mensual.
export function CoberturaPanel({ onVerGuia }: { onVerGuia: (ex: 'binance' | 'bitvavo') => void }) {
  const { data = [] } = useQuery({ queryKey: ['cobertura'], queryFn: portfolioApi.getCobertura })
  if (data.length === 0) return null
  return (
    <section aria-labelledby="cobertura-titulo" className={cardClasses('md', 'space-y-5')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="cobertura-titulo" className="text-sm font-medium text-fg">Cobertura de tus importaciones</h2>
        <span className="text-[11px] text-fg-subtle">De tu primera transacción a hoy · debajo, actividad por mes</span>
      </div>
      <LineaTiempo coberturas={data} />
      {data.map(c => {
        const total = c.tramos.reduce((s, t) => s + t.transacciones, 0)
        const items = [...c.huecos.map(h => ({ h, tipo: 'hueco' as const })), ...(c.pendiente ? [{ h: c.pendiente, tipo: 'pendiente' as const }] : [])]
        return (
          <div key={c.exchange} className="space-y-2 border-t border-border pt-3">
            <p className="flex items-center gap-2 text-sm">
              <ExchangeBadge exchange={c.exchange} size={18} />
              <span className="font-medium text-fg">{NOMBRE[c.exchange]}</span>
              <span className="text-xs text-fg-subtle">{formatFiscalDate(c.desde)} – {formatFiscalDate(c.hasta)} · {formatNumber(total, 0)} transacciones</span>
              {items.length === 0 && <span className="ml-auto inline-flex items-center gap-1 text-xs text-positive"><Check size={12} aria-hidden="true" /> Al día</span>}
            </p>
            {items.length > 0 && (
              <ul className="space-y-2 pt-1">
                {items.map(({ h, tipo }) => <Tramo key={`${tipo}-${h.desde}`} c={c} h={h} tipo={tipo} onVerGuia={onVerGuia} />)}
              </ul>
            )}
          </div>
        )
      })}
    </section>
  )
}
