import { Link } from 'react-router-dom'
import { ChevronDown, History, TrendingDown, TrendingUp } from 'lucide-react'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { NEUTRAL_COLOR, type AllocationItem, type AllocationMode, type PesoCoste } from '../../../utils/allocation'
import { destinosDistribucion } from '../../../utils/distribucionDestinos'
import { formatMoney, formatPercent, type Currency } from '../../../utils/format'
import { COLUMNAS } from './columnas'

// Fila de Distribución (#514): la fila abre Portfolio (el activo, la wallet o
// «Otros» filtrado); un icono abre el Historial con el mismo filtro; en
// wallets y «Otros», un botón despliega la composición. Fondo con un degradado
// del color del elemento hasta su peso. Columnas: valor, peso, peso frente a
// coste (en puntos) y variación 24 h.

const puntosTexto = (p: number) => {
  const r = Math.round(p)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} pp`
}

/** Iconos de los activos de «Otros», como mucho 4 y el número del resto. */
function IconosOtros({ members }: { members: AllocationItem['members'] }) {
  const vis = members.slice(0, 4)
  return (
    <span aria-hidden="true" className="flex items-center -space-x-1.5 shrink-0">
      {vis.map(m => <span key={m.key} className="rounded-full ring-2 ring-background-card"><CryptoIcon symbol={m.label} size={18} /></span>)}
      {members.length > vis.length && (
        <span className="ml-0.5 pl-2 text-[10px] mono text-fg-subtle">+{members.length - vis.length}</span>
      )}
    </span>
  )
}

export function FilaDistribucion({ item, mode, currency, peso, dimmed, open, onActive, onToggle }: {
  item: AllocationItem
  mode: AllocationMode
  currency: Currency
  peso: PesoCoste | undefined
  dimmed: boolean
  open: boolean
  onActive: (key: string | null) => void
  onToggle: () => void
}) {
  const otros = item.kind === 'other'
  const desplegable = otros || item.breakdown.length > 0
  const destinos = destinosDistribucion(item, mode)
  const fondo = `linear-gradient(90deg, color-mix(in srgb, ${item.color} 24%, transparent) 0%, color-mix(in srgb, ${item.color} 8%, transparent) ${Math.max(item.pct, 2)}%, transparent ${Math.max(item.pct, 2)}%)`
  const resumen = `${otros ? `Otros (${item.members.map(m => m.label).join(', ')})` : item.label}: ${formatMoney(item.value, currency)}, ${formatPercent(item.pct, 1)} de la cartera`
    + (peso ? `, ${formatPercent(peso.costPct, 1)} de lo invertido` : '')
    + (item.change24h !== null ? `, ${formatPercent(item.change24h, 1, true)} en 24 h` : '')
  const contenido = (
    <>
      {otros && mode === 'asset'
        ? <IconosOtros members={item.members} />
        : item.kind === 'crypto'
          ? <CryptoIcon symbol={item.label} size={24} ring={item.color} />
          : <span aria-hidden="true" className="w-6 h-6 rounded-md shrink-0" style={{ background: item.kind === 'fiat' ? `repeating-linear-gradient(45deg, ${NEUTRAL_COLOR} 0 3px, rgba(255,255,255,0.35) 3px 5px)` : item.color }} />}
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-fg truncate">{item.label}</span>
      <span className={`${COLUMNAS.valor} text-right text-xs mono text-fg shrink-0`}>{formatMoney(item.value, currency)}</span>
      <span className={`${COLUMNAS.peso} text-right text-xs mono text-fg-muted shrink-0`}>{formatPercent(item.pct, 1)}</span>
      <span className={`${COLUMNAS.coste} text-right text-xs mono text-fg-muted shrink-0`}>
        {peso && (
          <span className="inline-flex items-center justify-end gap-0.5">
            {Math.round(peso.puntos) > 0 ? <TrendingUp size={11} aria-hidden="true" /> : Math.round(peso.puntos) < 0 ? <TrendingDown size={11} aria-hidden="true" /> : null}
            {puntosTexto(peso.puntos)}
          </span>
        )}
      </span>
      <span className={`${COLUMNAS.cambio} text-right text-xs mono shrink-0 ${item.change24h === null ? 'text-fg-subtle' : item.change24h >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>
        {item.change24h === null ? '' : formatPercent(item.change24h, 1, true)}
      </span>
    </>
  )
  const claseFila = 'flex flex-1 min-w-0 items-center gap-2 sm:gap-3 px-2 py-1.5 rounded-lg text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
  return (
    <li>
      <div data-testid="fila-distribucion"
        // Atenuado como en el mapa de Variación (#438): sin degradado y con los iconos apagados, pero el texto
        // conserva su contraste (una opacidad sobre toda la fila lo dejaba por debajo de WCAG AA).
        className={`flex items-center rounded-lg transition-[background-color] duration-200 hover:bg-overlay/4 ${dimmed ? '[&_img]:opacity-35 [&_[aria-hidden=true].rounded-md]:opacity-35' : ''}`}
        style={{ backgroundImage: dimmed ? undefined : fondo }}
        onMouseEnter={() => onActive(item.key)} onFocus={() => onActive(item.key)} onBlur={() => onActive(null)}>
        {destinos.portfolio
          ? <Link to={destinos.portfolio.to} aria-label={`${resumen}. ${destinos.portfolio.nombre}`} className={claseFila}>{contenido}</Link>
          : <div className={claseFila}><span className="sr-only">{resumen}</span><span aria-hidden="true" className="contents">{contenido}</span></div>}
        <span className={`${COLUMNAS.acciones} flex items-center justify-end gap-0.5 shrink-0 pr-1`}>
          {destinos.historial && (
            <Link to={destinos.historial.to} aria-label={destinos.historial.nombre}
              className="inline-flex items-center justify-center size-6 rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <History size={14} aria-hidden="true" />
            </Link>
          )}
          {desplegable && (
            <button type="button" onClick={onToggle} aria-expanded={open}
              aria-label={`${open ? 'Ocultar' : 'Mostrar'} la composición de ${otros ? '«Otros»' : item.label}`}
              className="inline-flex items-center justify-center size-6 rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </span>
      </div>
      {open && !otros && (
        <ul aria-label={`Composición de ${item.label}`} className="ml-11 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-3">
          {item.breakdown.map(b => (
            <li key={b.key} className="flex items-center gap-3 text-xs py-0.5">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: b.color }} />
              <span className="flex-1 text-fg-muted truncate">{b.label}</span>
              <span className="mono text-fg-subtle w-12 text-right">{formatPercent(b.pct, 1)}</span>
              <span className="mono text-fg w-24 text-right">{formatMoney(b.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && otros && (
        <ul aria-label="Composición de «Otros»" className="ml-11 mt-0.5 mb-1 space-y-0.5 border-l border-border pl-3">
          {item.members.map(m => (
            <li key={m.key} className="flex items-center gap-3 text-xs py-0.5">
              {mode === 'asset' && <CryptoIcon symbol={m.label} size={16} />}
              <span className="flex-1 text-fg-muted truncate">{m.label}</span>
              <span className="mono text-fg-subtle w-12 text-right">{formatPercent(m.pct, 1)}</span>
              <span className="mono text-fg w-24 text-right">{formatMoney(m.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
