import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { TextTooltip, Tooltip, tableFootRowClasses, tableHeadRowClasses, tableRowClasses } from '../../../components/ui'
import { formatEur, formatEurSigned, formatNumber, formatPrice } from '../../../utils/format'
import { fiscalDateDetail, formatFiscalDate, formatFiscalQty } from '../../../utils/fiscalTable'
import { claveDe, conservadaDe, estadoCorto, metaDe, PLEGAR_DESDE, porMes, type TonoEstado } from '../../../utils/rendimientos'
import type { RendimientoEvent } from '../types'

// Rendimientos de una base del IRPF (#544), agrupados por mes con su subtotal.
// Con muchos (staking diario), los meses empiezan plegados.

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
const TONO_ESTADO: Record<TonoEstado, string> = {
  conservadas: 'bg-overlay/8 text-fg-muted',
  parte: 'bg-info/10 text-info-ink',
  fuera: 'bg-brand/10 text-brand-ink',
  sin_lote: 'text-fg-subtle',
}

const REVISAR: Record<'airdrop' | 'cashback', string> = {
  airdrop: 'La app lo declara como ganancia patrimonial no derivada de transmisión, en la base general y valorado al recibirlo. No hay una consulta vinculante específica: es un criterio prudente. Revísalo con tu asesor.',
  cashback: 'La app lo trata como ganancia patrimonial en la base general. Si es una devolución de comisión, podría tratarse como menor coste de la operación. Revísalo con tu asesor.',
}

function EstadoCelda({ r }: { r: RendimientoEvent }) {
  const { texto, tono } = estadoCorto(r.estado)
  const e = r.estado
  if (tono === 'sin_lote' || !e) {
    return (
      <TextTooltip label="Cobrado en euros"
        tip="Se cobró en euros, que no son una criptomoneda: no tienen coste FIFO y gastarlos (por ejemplo, en una compra) no tributa. Solo se declara al recibirlo.">
        <span className="text-xs text-fg-subtle">{texto}</span>
      </TextTooltip>
    )
  }
  const q = formatFiscalQty
  const detalle = <>
    <p>Recibiste {q(e.cantidad)}; conservas {q(conservadaDe(e))}.</p>
    {e.transmitida > 0 && (
      <p className="mt-1.5">Transmitidas {q(e.transmitida)}, con un resultado de <span className="mono">{formatEurSigned(e.resultadoEur)}</span>, en {e.anios.map((a, i) => (
        <span key={a}>{i > 0 && (i === e.anios.length - 1 ? ' y ' : ', ')}<Link to={`/fiscal?vista=operaciones&anio=${a}`} className={`text-brand-ink hover:underline rounded ${FOCO}`}>{a}</Link></span>
      ))}. Su coste fue el valor al recibirlas.</p>
    )}
    {(e.sinEfecto ?? 0) > 1e-9 && (
      <p className="mt-1.5">Salieron sin efecto fiscal {q(e.sinEfecto)}: se usaron para devolver un préstamo de margen o pagar una comisión de red sumada al coste.</p>
    )}
    {e.transmitida <= 0 && (e.sinEfecto ?? 0) <= 1e-9 && <p className="mt-1.5">Su coste FIFO es el valor al recibirlas.</p>}
  </>
  return (
    <Tooltip label="Estado de las unidades" triggerLabel={`${texto}. Ver detalle`} trigger={texto}
      triggerClassName={`px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${TONO_ESTADO[tono]} ${FOCO}`}>
      {detalle}
    </Tooltip>
  )
}

function FechaEnlace({ r }: { r: RendimientoEvent }) {
  return (
    <time dateTime={r.fechaHora ?? r.fecha}>
      {r.txId
        ? <Link to={`/history?tx=${encodeURIComponent(r.txId)}`} className={`hover:underline rounded ${FOCO}`} aria-label={`Ver en Historial el rendimiento del ${formatFiscalDate(r.fecha)}`}>{formatFiscalDate(r.fecha)}</Link>
        : <TextTooltip label="Fecha y hora" tip={fiscalDateDetail(r.fechaHora)}>{formatFiscalDate(r.fecha)}</TextTooltip>}
    </time>
  )
}

function ActivoEnlace({ r }: { r: RendimientoEvent }) {
  return (
    <Link to={`/portfolio?activo=${encodeURIComponent(r.activo)}`} aria-label={`Ver ${r.activo} en Portfolio`}
      className={`inline-flex items-center gap-1.5 hover:underline rounded ${FOCO}`}>
      <CryptoIcon symbol={r.activo} size={16} /><span className="font-bold mono">{r.activo}</span>
    </Link>
  )
}

function TipoCelda({ r, onAyuda }: { r: RendimientoEvent; onAyuda: () => void }) {
  const clave = claveDe(r)
  const meta = metaDe(clave)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[11px] bg-overlay/8 text-fg-muted px-1.5 py-0.5 rounded-lg">{meta.label === 'Airdrops' ? 'Airdrop' : meta.label}</span>
      {(clave === 'airdrop' || clave === 'cashback') && (
        // Pulsar abre la ayuda: un enlace dentro del tooltip no se puede alcanzar al pasar el ratón.
        <Tooltip label={`${meta.label}: por revisar`} onActivate={onAyuda}
          triggerLabel={`Por revisar: ${REVISAR[clave]} Pulsa para ver cómo tributan los rendimientos.`} trigger="Revisar"
          triggerClassName={`px-1.5 py-0.5 rounded-lg text-[11px] bg-warning/12 text-warning-ink hover:bg-warning/20 cursor-pointer ${FOCO}`}>
          <p>{REVISAR[clave]}</p>
          <p className="mt-1.5 text-fg-subtle">Pulsa para ver cómo tributan los rendimientos.</p>
        </Tooltip>
      )}
    </span>
  )
}

function CabeceraMes({ label, n, abierto, onAlternar }: { label: string; n: number; abierto: boolean; onAlternar: () => void }) {
  return (
    <button type="button" onClick={onAlternar} aria-expanded={abierto}
      className={`inline-flex items-center gap-1.5 text-xs text-fg capitalize rounded ${FOCO}`}>
      <ChevronDown size={13} aria-hidden="true" className={`text-fg-subtle transition-transform ${abierto ? '' : '-rotate-90'}`} />
      {label}
      <span className="normal-case text-fg-subtle font-normal">· {formatNumber(n, 0)} {n === 1 ? 'rendimiento' : 'rendimientos'}</span>
    </button>
  )
}

export function TablaBase({ rendimientos, caption, onAyuda }: {
  rendimientos: readonly RendimientoEvent[]
  caption: string
  onAyuda: () => void
}) {
  const grupos = porMes(rendimientos)
  const plegadoInicial = rendimientos.length > PLEGAR_DESDE
  const [abiertos, setAbiertos] = useState<ReadonlySet<number>>(() => new Set(plegadoInicial ? [] : grupos.map(g => g.mes)))
  const alternar = (mes: number) => setAbiertos(s => { const n = new Set(s); if (n.has(mes)) n.delete(mes); else n.add(mes); return n })
  const total = rendimientos.reduce((s, r) => s + r.valorEur, 0)
  const COLS = 8

  const recuento = `${formatNumber(rendimientos.length, 0)} ${rendimientos.length === 1 ? 'rendimiento' : 'rendimientos'}`

  return (
    <>
    {/* Tarjetas cuando la sección no da para la tabla (necesita unos 918 px): mismo contenido. */}
    <ul aria-label={caption} className="@min-[58rem]:hidden divide-y divide-border border-t border-border">
      {grupos.map(g => {
        const abierto = abiertos.has(g.mes)
        return (
          <li key={g.mes}>
            <div className="flex items-center justify-between gap-2 px-4 py-2 bg-overlay/[0.03]">
              <CabeceraMes label={g.label} n={g.items.length} abierto={abierto} onAlternar={() => alternar(g.mes)} />
              <span className="mono text-xs font-medium text-fg">{formatEur(g.total)}</span>
            </div>
            {abierto && (
              <ul className="divide-y divide-border">
                {g.items.map((r, i) => (
                  <li key={r.txId ?? `${r.fecha}-${i}`} className="px-4 py-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-fg-muted"><FechaEnlace r={r} /><TipoCelda r={r} onAyuda={onAyuda} /></span>
                      <span className="mono text-sm font-semibold text-fg">{formatEur(r.valorEur)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-fg-muted">
                      <ActivoEnlace r={r} />
                      <span className="mono">{formatFiscalQty(r.cantidad)} a {r.precioEur != null ? formatPrice(r.precioEur) : '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-fg-subtle"><EstadoCelda r={r} /><span>{r.wallet}</span></div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
      <li className="flex justify-between px-4 py-2.5 text-xs font-medium text-fg-subtle">
        <span>{recuento}</span><span className="mono font-bold text-fg">{formatEur(total)}</span>
      </li>
    </ul>
    <div className="hidden @min-[58rem]:block relative overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={tableHeadRowClasses()}>
            <th scope="col" className="text-left px-4 py-2.5">Fecha</th>
            <th scope="col" className="text-left px-3 py-2.5">Activo</th>
            <th scope="col" className="text-left px-3 py-2.5">Tipo</th>
            <th scope="col" className="text-right px-3 py-2.5">Cantidad</th>
            <th scope="col" className="text-right px-3 py-2.5">Precio al recibir</th>
            <th scope="col" className="text-right px-3 py-2.5">
              <span className="inline-flex items-center justify-end gap-0.5 w-full">Valor (coste FIFO)
                <Tooltip label="Valor y coste FIFO"><p>Cantidad por precio al recibir. Es lo que se declara y, a la vez, el coste de esas unidades cuando las vendas o permutes.</p></Tooltip>
              </span>
            </th>
            <th scope="col" className="text-left px-3 py-2.5">Estado</th>
            <th scope="col" className="text-left px-3 py-2.5">Wallet</th>
          </tr>
        </thead>
        {grupos.map(g => {
          const abierto = abiertos.has(g.mes)
          return (
            <tbody key={g.mes} className="divide-y divide-border">
              <tr className="bg-overlay/[0.03]">
                <th scope="colgroup" colSpan={5} className="text-left px-4 py-2 font-medium">
                  <CabeceraMes label={g.label} n={g.items.length} abierto={abierto} onAlternar={() => alternar(g.mes)} />
                </th>
                <td className="px-3 py-2 text-right mono font-medium text-fg">{formatEur(g.total)}</td>
                <td colSpan={COLS - 6} />
              </tr>
              {abierto && g.items.map((r, i) => (
                  <tr key={r.txId ?? `${r.fecha}-${i}`} data-rendimiento className={tableRowClasses()}>
                    <td className="px-4 py-2.5 text-fg-muted whitespace-nowrap"><FechaEnlace r={r} /></td>
                    <td className="px-3 py-2.5"><ActivoEnlace r={r} /></td>
                    <td className="px-3 py-2.5"><TipoCelda r={r} onAyuda={onAyuda} /></td>
                    <td className="px-3 py-2.5 text-right mono text-fg-muted">{formatFiscalQty(r.cantidad)}</td>
                    <td className="px-3 py-2.5 text-right mono text-fg-muted">{r.precioEur != null ? formatPrice(r.precioEur) : '-'}</td>
                    <td className="px-3 py-2.5 text-right mono font-medium text-fg">{formatEur(r.valorEur)}</td>
                    <td className="px-3 py-2.5"><EstadoCelda r={r} /></td>
                    <td className="px-3 py-2.5 text-fg-subtle whitespace-nowrap">{r.wallet}</td>
                  </tr>
              ))}
            </tbody>
          )
        })}
        <tfoot>
          <tr className={tableFootRowClasses()}>
            <td className="px-4 py-2.5 text-fg-subtle font-medium" colSpan={5}>{recuento}</td>
            <td className="px-3 py-2.5 text-right mono font-bold text-fg">{formatEur(total)}</td>
            <td colSpan={COLS - 6} />
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  )
}
