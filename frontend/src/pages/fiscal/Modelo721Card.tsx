import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { parseImporte, umbralSiguiente721 } from '../../utils/declaraciones'
import { AlertTriangle, ChevronRight, Download, Landmark, ShieldCheck } from 'lucide-react'
import { formatEur, formatPercent, formatPrice } from '../../utils/format'
import { CryptoIcon } from '../../components/CryptoIcon'
import { InfoTooltip } from '../../components/InfoTooltip'
import { buttonClasses, cardClasses, fieldClasses } from '../../components/ui'
import { usePrivacyStore } from '../../store/privacyStore'
import { ink } from '../../utils/colors'
import { formatFiscalDate, formatFiscalQty } from '../../utils/fiscalTable'
import { MODELO721_LABELS, modelo721Status, pendingPricesText } from '../../utils/modelo721Status'
import { buildModelo721Csv, liveModelo721, margenUmbral, modelo721View, type ExchangeGroup } from '../../utils/modelo721View'
import { usePricesStore } from '../../store/pricesStore'
import type { Modelo721 } from './types'

// Modelo 721 (#303): custodia de terceros frente al umbral, desglose por
// exchange desplegable, autocustodia resumida (no computa) y exportación.

const STATUS_CLASS = {
  obligatorio: 'bg-negative/10 border-negative/25 text-negative-ink',
  incompleto: 'bg-warning/10 border-warning/25 text-warning',
  'sin-obligacion': 'bg-positive/10 border-positive/25 text-positive-ink',
} as const

function ExchangeRow({ g, total }: { g: ExchangeGroup; total: number }) {
  const [open, setOpen] = useState(false)
  const id = `m721-${g.walletId}`
  const pct = total > 0 ? (g.valor / total) * 100 : 0
  return (
    <li className="rounded-xl border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-overlay/3 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60">
        <ChevronRight size={14} className={`text-fg-subtle shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} aria-hidden="true" />
        <span className="text-sm font-medium truncate" style={{ color: ink(g.color) }}>{g.name}</span>
        <span className="text-[11px] text-fg-subtle shrink-0">{g.activos.length} {g.activos.length === 1 ? 'activo' : 'activos'}</span>
        {g.sinPrecio > 0 && <span className="text-[11px] text-warning shrink-0">{g.sinPrecio} sin precio</span>}
        <span className="ml-auto text-right shrink-0">
          <span className="block mono tabular-nums text-sm font-semibold text-fg">{formatEur(g.valor)}</span>
          <span className="block mono text-[10px] text-fg-subtle">{formatPercent(pct, 1)}</span>
        </span>
      </button>
      {open && (
        <div id={id} className="border-t border-border overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-fg-subtle bg-overlay/3">
                <th scope="col" className="text-left font-medium px-3 py-2">Activo</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Cantidad</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Precio</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {g.activos.map(a => (
                <tr key={a.asset}>
                  <th scope="row" className="text-left font-normal px-3 py-2">
                    <span className="inline-flex items-center gap-1.5"><CryptoIcon symbol={a.asset} size={14} /><span className="mono font-semibold text-fg">{a.asset}</span></span>
                  </th>
                  <td className="text-right mono px-3 py-2 text-fg-muted">{formatFiscalQty(a.quantity)}</td>
                  <td className="text-right mono px-3 py-2 text-fg-muted">{a.sinPrecio ? <span className="text-warning">sin precio</span> : formatPrice(a.precioEur)}</td>
                  <td className="text-right mono px-3 py-2 text-fg">{formatEur(a.valorEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}

/** Marca del 721 presentado con su valor (#311); ese valor fija la regla del incremento para los años siguientes. */
function Presentado({ data, year }: { data: Modelo721; year: number }) {
  const qc = useQueryClient()
  const [valor, setValor] = useState('')
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fiscal-721'] })
    void qc.invalidateQueries({ queryKey: ['fiscal-calendario'] })
    void qc.invalidateQueries({ queryKey: ['fiscal-declaraciones'] })
  }
  const marcar = useMutation({
    mutationFn: () => {
      const v = parseImporte(valor)
      return portfolioApi.marcar721(year, Number.isFinite(v) && v >= 0 ? v : undefined)
    },
    onSuccess: refresh,
  })
  const quitar = useMutation({ mutationFn: () => portfolioApi.quitarDeclaracion(year, 'modelo721'), onSuccess: refresh })
  const busy = marcar.isPending || quitar.isPending
  const error = marcar.error ?? quitar.error

  if (data.presentado) {
    return (
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-positive/25 bg-positive/5 px-3 py-2.5 text-xs">
        <ShieldCheck size={14} className="text-positive shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-[12rem] text-fg-muted">
          Presentado el {formatFiscalDate(data.presentado.declaradoEn.slice(0, 10))} con <span className="mono text-fg">{formatEur(data.presentado.valor)}</span>.
        </p>
        <button type="button" onClick={() => quitar.mutate()} disabled={busy} className={buttonClasses('ghost', 'sm')}>Quitar marca</button>
        {error && <p role="alert" className="w-full text-negative">{error.message}</p>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border px-3 py-2.5 text-xs">
      <p className="flex-1 min-w-[12rem] text-fg-muted">¿Lo presentaste? Guarda el valor declarado para aplicar la regla del incremento los años siguientes.</p>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Valor declarado en euros</span>
        <input type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} maxLength={16}
          placeholder={formatEur(data.totalValorCustodia)} className={fieldClasses('sm', false, 'w-32 mono text-right')}
          title="Por defecto, el valor en exchanges a 31 de diciembre" />
      </label>
      <button type="button" onClick={() => marcar.mutate()} disabled={busy} className={buttonClasses('secondary', 'sm')}>Marcar como presentado</button>
      {error && <p role="alert" className="w-full text-negative">{error.message}</p>}
    </div>
  )
}

export function Modelo721Card({ data: snapshot, activeYear }: { data: Modelo721; activeYear: number }) {
  const privacy = usePrivacyStore(s => s.hidden)
  // Año en curso: precios en vivo del feed (EUR) sobre la foto del backend (#303).
  const livePrices = usePricesStore(s => s.prices)
  const data = useMemo(() => liveModelo721(snapshot, livePrices), [snapshot, livePrices])
  const view = modelo721View(data.activos)
  const status = modelo721Status(data)
  const pending = pendingPricesText(data.preciosPendientes)
  const min = data.incompleto ? '≥ ' : ''
  const pctUmbral = Math.min((data.totalValorCustodia / data.umbral) * 100, 100)
  const margen = margenUmbral(data)
  const barColor = data.superaUmbral ? 'bg-negative' : pctUmbral > 75 ? 'bg-warning' : 'bg-positive'

  function exportCsv() {
    const blob = new Blob(['﻿' + buildModelo721Csv(data)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `modelo721_${activeYear}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="m721-title" className={cardClasses('none', `overflow-hidden ${data.superaUmbral ? 'border-negative/40' : ''}`)}>
      {/* Cabecera: título, estado, fecha de valoración y exportación */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 id="m721-title" className="font-semibold text-sm text-fg">Modelo 721 · {activeYear}</h3>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border ${STATUS_CLASS[status]}`}>
              {status !== 'sin-obligacion' && <AlertTriangle size={11} aria-hidden="true" />}
              {status === 'obligatorio' ? 'Obligatorio declarar' : MODELO721_LABELS[status]}
            </span>
          </div>
          <p className="text-xs text-fg-subtle mt-1">
            {data.esAnioEnCurso
              ? <>Valor en vivo, {formatFiscalDate(data.fecha)} · cuenta el del 31 de diciembre</>
              : <>Valoración a {formatFiscalDate(data.fecha)} · plazo del 1 de enero al 31 de marzo de {activeYear + 1}</>}
          </p>
        </div>
        <button type="button" onClick={exportCsv} disabled={privacy || view.exchanges.length === 0}
          className={buttonClasses('secondary', 'sm', 'flex gap-1')}
          title={privacy ? 'Desactiva el modo privacidad para exportar' : 'Posiciones en exchanges por activo, para preparar el modelo'}>
          <Download size={11} aria-hidden="true" /> CSV del 721
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Custodia de terceros frente al umbral */}
        <div>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-fg-subtle">En custodia de terceros</p>
              <p className={`text-2xl font-bold mono tabular-nums mt-1 ${data.superaUmbral ? 'text-negative' : 'text-fg'}`}>{min}{formatEur(data.totalValorCustodia)}</p>
            </div>
            <p className="text-xs text-fg-subtle text-right">
              {margen >= 0
                ? <>Margen hasta el umbral: <span className="mono text-fg-muted">{formatEur(margen)}</span></>
                : <>Supera el umbral en <span className="mono text-negative">{formatEur(-margen)}</span></>}
            </p>
          </div>
          <div className="mt-2 h-2 bg-background-tertiary rounded-full overflow-hidden" role="img"
            aria-label={`${formatPercent(pctUmbral, 0)} del umbral de ${formatEur(data.umbral)}`}>
            <div className={`h-full rounded-full transition-[width] duration-500 ${barColor}`} style={{ width: `${Math.max(pctUmbral, data.totalValorCustodia > 0 ? 1 : 0)}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-fg-subtle mt-1 mono">
            <span>0 €</span><span>{formatPercent(pctUmbral, 0)} del umbral</span><span>{formatEur(data.umbral)}</span>
          </div>
        </div>

        {/* Desglose por exchange */}
        {view.exchanges.length > 0 ? (
          <ul className="space-y-2" aria-label="Valor por exchange">
            {view.exchanges.map(g => <ExchangeRow key={g.walletId} g={g} total={view.totalExchanges} />)}
          </ul>
        ) : (
          <p className="text-xs text-fg-subtle">No hay activos en exchanges a esta fecha.</p>
        )}

        {/* Autocustodia: no computa */}
        {view.autocustodia.activos > 0 && (
          <p className="flex items-start gap-2 text-xs text-fg-subtle px-3 py-2 rounded-xl bg-overlay/3">
            <ShieldCheck size={13} className="text-brand shrink-0 mt-px" aria-hidden="true" />
            <span>
              Autocustodia: <span className="mono text-fg-muted">{formatEur(view.autocustodia.valor)}</span>{' '}
              en {view.autocustodia.wallets} {view.autocustodia.wallets === 1 ? 'wallet' : 'wallets'} · no computa
            </span>
          </p>
        )}

        {pending && (
          <p role="status" className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-xl text-xs text-warning">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
            {pending}: los totales son un mínimo. Se completarán cuando las fuentes de precios respondan.
          </p>
        )}

        {/* Cuándo hay que presentarlo (#311: regla del incremento de 20.000 €) */}
        <div className="flex items-start gap-2 p-3 rounded-xl border border-border text-xs text-fg-muted">
          <Landmark size={12} className="shrink-0 mt-0.5 text-fg-subtle" aria-hidden="true" />
          <div className="space-y-1">
            <p>
              Hay que presentarlo si el valor en exchanges extranjeros supera {formatEur(data.umbral)} a 31 de diciembre.
              Una vez presentado, solo se repite si ese valor aumenta más de 20.000 € respecto al último presentado, o si dejas de ser titular de lo declarado.{' '}
              <InfoTooltip label="Qué exchanges cuentan">
                <p>{data.aviso}</p>
              </InfoTooltip>
            </p>
            {data.ultimaPresentacion && (
              <p>
                Último presentado: <span className="mono text-fg">{data.ultimaPresentacion.ejercicio}</span> con <span className="mono text-fg">{formatEur(data.ultimaPresentacion.valor)}</span>;
                este ejercicio obliga por encima de <span className="mono text-fg">{formatEur(umbralSiguiente721(data.umbral, data.ultimaPresentacion))}</span>.
              </p>
            )}
          </div>
        </div>

        {/* Presentado (solo ejercicios cerrados) */}
        {!data.esAnioEnCurso && <Presentado data={data} year={activeYear} />}
      </div>
    </section>
  )
}
