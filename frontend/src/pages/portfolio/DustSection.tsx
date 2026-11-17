import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, ChevronDown, Settings } from 'lucide-react'
import { Button, panelClasses, panelEnterStyle, panelSurface } from '../../components/ui'
import { formatMoney } from '../../utils/format'
import { formatNumeroLocal } from '../../utils/numeroLocal'
import { validateDust } from '../../utils/settingsValidation'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { useUmbralRestos } from '../../hooks/useUmbralRestos'
import { fichasRestos, NOMBRE_RESTOS, type FichaResto as Ficha } from '../../utils/saldosResiduales'
import type { UnifiedRow } from '../../utils/assetTable'
import { FichaResto } from './restos/FichaResto'
import { ConversionRestosModal } from './restos/ConversionRestosModal'

// Saldos residuales (#269, rehecho en #530): un único bloque al final con un
// solo nombre. Fichas compactas por activo y wallet; «Ocultar restos» lo
// pliega a una línea (se recuerda); el umbral se cambia aquí mismo (el mismo
// ajuste que Ajustes, General); «Registrar conversión de restos» selecciona
// restos de una wallet y abre el diálogo que los registra como permutas.

export function DustSection({ rows, value, open, onToggle, index, onOpen, sugerencias }: {
  rows: UnifiedRow[]
  value: number
  open: boolean
  onToggle: () => void
  index: number
  /** Abre el detalle del activo (#460): los restos también tienen su panel. */
  onOpen: (asset: string, order: readonly string[]) => void
  /** Activos de la cartera para sugerir el recibido en la conversión. */
  sugerencias: readonly string[]
}) {
  const currency = useCurrency()
  const { umbral, cambiar } = useUmbralRestos()
  const fichas = useMemo(() => fichasRestos(rows), [rows])
  const [seleccionando, setSeleccionando] = useState(false)
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set())
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [umbralRaw, setUmbralRaw] = useState<string | null>(null)
  const [umbralError, setUmbralError] = useState<string | null>(null)
  if (rows.length === 0) return null

  const seleccion = fichas.filter(f => elegidas.has(f.key))
  const walletElegida = seleccion[0]?.walletId ?? null
  const orden = [...new Set(fichas.map(f => f.asset))]
  const salirSeleccion = () => { setSeleccionando(false); setElegidas(new Set()) }
  const pulsar = (f: Ficha) => {
    if (!seleccionando) { onOpen(f.asset, orden); return }
    setElegidas(prev => {
      const next = new Set(prev)
      if (next.has(f.key)) next.delete(f.key)
      else next.add(f.key)
      return next
    })
  }
  function guardarUmbral() {
    if (umbralRaw === null) return
    const v = validateDust(umbralRaw)
    if (!v.ok) { setUmbralError(v.error); return }
    setUmbralRaw(null)
    setUmbralError(null)
    void cambiar(v.value)
  }

  return (
    <section aria-label={NOMBRE_RESTOS} className={panelClasses(panelSurface('none', 'overflow-clip'))} style={panelEnterStyle(index)}>
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{NOMBRE_RESTOS}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-overlay/6 text-fg-muted" data-testid="restos-recuento">
            {fichas.length} {fichas.length === 1 ? 'resto' : 'restos'}
          </span>
          <span className="text-xs mono tabular-nums text-fg-muted">{formatMoney(value, currency)} en total</span>
        </div>
        <button type="button" onClick={() => { onToggle(); if (open) salirSeleccion() }} aria-expanded={open}
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg rounded-lg px-2 py-1 hover:bg-overlay/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? '' : '-rotate-90'}`} />
          {open ? 'Ocultar restos' : 'Mostrar restos'}
        </button>
      </div>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs text-fg-muted">
              <label htmlFor="restos-umbral">Restos de menos de</label>
              <span className={`inline-flex items-center rounded-lg border bg-background-tertiary overflow-hidden ${umbralError ? 'border-negative' : 'border-border focus-within:border-brand'}`}>
                <input id="restos-umbral" inputMode="decimal" autoComplete="off" value={umbralRaw ?? formatNumeroLocal(umbral, 2, 2)}
                  aria-invalid={!!umbralError} aria-describedby={umbralError ? 'restos-umbral-error' : 'restos-umbral-ayuda'}
                  onChange={e => { setUmbralRaw(e.target.value); setUmbralError(null) }}
                  onBlur={guardarUmbral} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="w-16 px-2 py-1 text-right mono bg-transparent text-fg focus:outline-hidden" />
                <span className="px-2 py-1 border-l border-border bg-background-secondary text-fg-subtle">€</span>
              </span>
              <Link to="/settings?tab=general" className="inline-flex items-center gap-1 text-brand-ink underline underline-offset-2 hover:no-underline rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                <Settings size={12} aria-hidden="true" /> Más en Ajustes
              </Link>
              {umbralError
                ? <span id="restos-umbral-error" role="alert" className="text-negative-ink">{umbralError}</span>
                : <span id="restos-umbral-ayuda" className="sr-only">El mismo ajuste que «Umbral de saldos residuales» en Ajustes, General</span>}
            </div>
            {!seleccionando
              ? <Button variant="secondary" size="sm" onClick={() => setSeleccionando(true)}>
                  <ArrowRightLeft size={14} aria-hidden="true" /> Registrar conversión de restos
                </Button>
              : <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={salirSeleccion}>Cancelar</Button>
                  <Button variant="primary" size="sm" disabled={seleccion.length === 0} onClick={() => setConvirtiendo(true)}>
                    Continuar con {seleccion.length} {seleccion.length === 1 ? 'resto' : 'restos'}
                  </Button>
                </div>}
          </div>
          {seleccionando && (
            <p className="text-[11px] text-fg-muted" aria-live="polite">
              {walletElegida
                ? <>Restos de <strong className="text-fg">{seleccion[0].walletName}</strong>: la conversión se hace dentro de una wallet, así que los de otras quedan deshabilitados.</>
                : 'Elige los restos que convertiste. Deben ser de la misma wallet.'}
            </p>
          )}
          <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]" aria-label={`${NOMBRE_RESTOS} por activo y wallet`}>
            {fichas.map(f => (
              <FichaResto key={f.key} ficha={f} currency={currency} seleccionando={seleccionando}
                seleccionada={elegidas.has(f.key)} deshabilitada={seleccionando && walletElegida !== null && f.walletId !== walletElegida}
                onPulsar={() => pulsar(f)} />
            ))}
          </ul>
        </div>
      )}
      {convirtiendo && seleccion.length > 0 && (
        <ConversionRestosModal fichas={seleccion} sugerencias={sugerencias}
          onClose={() => setConvirtiendo(false)} onDone={() => { setConvirtiendo(false); salirSeleccion() }} />
      )}
    </section>
  )
}
