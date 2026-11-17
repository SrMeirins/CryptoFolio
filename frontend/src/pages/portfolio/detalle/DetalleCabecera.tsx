import { useEffect, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, History, Landmark, X } from 'lucide-react'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { buttonClasses, Hint, iconButtonClasses } from '../../../components/ui'
import { useFlashOnChange } from '../../../hooks/useFlashOnChange'
import { formatPercent, formatPrice, type Currency } from '../../../utils/format'
import { assetPosition, neighbourAsset } from '../../../utils/assetNav'

// Cabecera del panel de detalle (#528): activo, precio en vivo con un punto que
// late y un destello al cambiar (con flecha: el sentido no va solo en el
// color), variación 24 h, navegación entre activos con [ y ] (o los botones,
// con «3 de 12») y accesos a Historial y Fiscal del activo.

/** Las teclas [ y ] no navegan mientras se escribe en un campo. */
function escribiendo(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function DetalleCabecera({ asset, titleId, price, change24h, currency, live, order, onNavigate, onClose, closeRef }: {
  asset: string
  titleId: string
  price: number
  change24h: number | null
  currency: Currency
  /** Hay precio en vivo del activo. */
  live: boolean
  /** Orden de la tabla desde la que se abrió el panel. */
  order: readonly string[]
  onNavigate: (asset: string) => void
  onClose: () => void
  closeRef: RefObject<HTMLButtonElement>
}) {
  const flash = useFlashOnChange(price)
  const prev = neighbourAsset(order, asset, -1)
  const next = neighbourAsset(order, asset, 1)
  const pos = assetPosition(order, asset)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || escribiendo(e.target)) return
      const to = e.key === '[' ? prev : e.key === ']' ? next : null
      if (!to) return
      e.preventDefault()
      onNavigate(to)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [prev, next, onNavigate])

  const hasPrice = price > 0
  return (
    <div className="px-5 py-4 border-b border-border space-y-3">
      <div className="flex items-start gap-3">
        <CryptoIcon symbol={asset} size={40} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold text-fg leading-tight">{asset}</h2>
          <p className="flex items-center gap-2 mt-0.5 mono tabular-nums text-sm flex-wrap">
            {live && hasPrice && (
              <span className="relative flex size-2 shrink-0" aria-hidden="true" data-testid="detalle-en-vivo">
                <span className="absolute inset-0 rounded-full bg-positive opacity-60 motion-safe:animate-ping" />
                <span className="relative size-2 rounded-full bg-positive" />
              </span>
            )}
            <span className={`rounded-md px-1 -mx-1 text-fg ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}>
              {hasPrice ? formatPrice(price, currency) : 'Sin precio'}
            </span>
            {flash && (
              <span className={flash === 'up' ? 'text-positive-ink' : 'text-negative-ink'}>
                {flash === 'up' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                <span className="sr-only">{flash === 'up' ? 'El precio ha subido' : 'El precio ha bajado'}</span>
              </span>
            )}
            {live && hasPrice && <span className="sr-only">Precio en vivo</span>}
            {change24h !== null && (
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border whitespace-nowrap ${change24h >= 0 ? 'text-positive-ink bg-positive/8 border-positive/25' : 'text-negative-ink bg-negative/8 border-negative/25'}`}>
                <span className="font-medium">24 h</span> {change24h >= 0 ? '▲' : '▼'} {formatPercent(change24h, 2, true)}
              </span>
            )}
          </p>
        </div>
        {pos && pos.total > 1 && (
          <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Cambiar de activo">
            <Hint label={`Activo anterior: ${prev ?? ''} ([)`}>
              <button type="button" onClick={() => prev && onNavigate(prev)} className={iconButtonClasses('md')}
                aria-label={`Activo anterior: ${prev ?? ''}`} aria-keyshortcuts="[">
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            </Hint>
            <span className="text-[11px] text-fg-subtle mono tabular-nums whitespace-nowrap" aria-live="polite">{pos.index} de {pos.total}</span>
            <Hint label={`Activo siguiente: ${next ?? ''} (])`}>
              <button type="button" onClick={() => next && onNavigate(next)} className={iconButtonClasses('md')}
                aria-label={`Activo siguiente: ${next ?? ''}`} aria-keyshortcuts="]">
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </Hint>
          </div>
        )}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar el detalle" className={iconButtonClasses('md')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <nav aria-label={`Accesos de ${asset}`} className="flex items-center gap-2 flex-wrap">
        <Link to={`/history?buscar=${encodeURIComponent(asset)}`} className={buttonClasses('secondary', 'sm')}>
          <History size={14} aria-hidden="true" /> Ver en Historial
        </Link>
        <Link to={`/fiscal?vista=operaciones&activo=${encodeURIComponent(asset)}`} className={buttonClasses('secondary', 'sm')}>
          <Landmark size={14} aria-hidden="true" /> Ver en Fiscal
        </Link>
        {pos && pos.total > 1 && (
          <span className="ml-auto text-[11px] text-fg-subtle">
            Usa <kbd className="mono px-1 rounded border border-border">[</kbd> y <kbd className="mono px-1 rounded border border-border">]</kbd> para cambiar de activo
          </span>
        )}
      </nav>
    </div>
  )
}
