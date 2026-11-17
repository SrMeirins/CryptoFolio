import { useMemo, useState } from 'react'
import { formatAmount, formatPercent, formatPrice, type Currency } from '../../../utils/format'
import { formatLotDate, type LotView } from '../../../utils/portfolioLots'
import { reglaPrecios, type CirculoRegla, type LadoRegla } from '../../../utils/reglaPrecios'

// Regla de precios de compra (#528): cada compra abierta es un círculo en su
// precio de compra, de tamaño proporcional a la cantidad, sobre una línea de
// barato a caro con el precio actual marcado. A la izquierda de la marca, lo
// comprado más barato (en beneficio); a la derecha, más caro (en pérdida). El
// lado se dice con texto (resumen y rótulos), no solo con el color. Al pasar
// por un círculo se lee esa compra debajo.

function Lado({ titulo, lado, asset, currency, tono }: { titulo: string; lado: LadoRegla; asset: string; currency: Currency; tono: 'positive' | 'negative' }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${tono === 'positive' ? 'border-positive/30 bg-positive/5' : 'border-negative/30 bg-negative/5'}`}>
      <p className={`text-[11px] font-semibold ${tono === 'positive' ? 'text-positive-ink' : 'text-negative-ink'}`}>{titulo}</p>
      {lado.compras === 0
        ? <p className="text-[11px] text-fg-subtle">Ninguna compra</p>
        : <p className="text-[11px] text-fg-muted mono tabular-nums">
            {lado.compras} {lado.compras === 1 ? 'compra' : 'compras'}, {formatAmount(lado.cantidad)} {asset}
            {lado.precioMedio !== null && <>, medio {formatPrice(lado.precioMedio, currency)}</>}
          </p>}
    </div>
  )
}

export function ReglaPrecios({ lots, price, avg, asset, currency }: {
  lots: readonly LotView[]
  price: number
  avg: number | null
  asset: string
  currency: Currency
}) {
  const r = useMemo(() => reglaPrecios(lots, price, avg), [lots, price, avg])
  const [activo, setActivo] = useState<CirculoRegla | null>(null)
  if (!r) return null

  return (
    <div className="space-y-2.5" data-testid="regla-precios">
      <div className="space-y-0.5">
        <h4 className="text-xs font-semibold text-fg">Precios de compra frente al precio actual</h4>
        {r.pctBeneficio !== null && (
          <p className="text-[11px] text-fg-muted">
            El <strong className="text-fg">{formatPercent(r.pctBeneficio, 0)}</strong> de tu {asset} se compró por debajo del precio actual y está en beneficio.
          </p>
        )}
      </div>

      <div aria-hidden="true" className="pt-5 pb-1">
        <div className="relative h-8">
          {/* Zonas: más barato que el precio actual (beneficio) y más caro (pérdida). */}
          {r.posPrecio !== null && (
            <>
              <span className="absolute inset-y-2 left-0 rounded-l-full bg-positive/10" style={{ width: `${r.posPrecio}%` }} />
              <span className="absolute inset-y-2 right-0 rounded-r-full bg-negative/10" style={{ width: `${100 - r.posPrecio}%` }} />
              <span className="absolute -top-5 text-[10px] font-semibold text-positive-ink" style={{ left: 0 }}>En beneficio</span>
              <span className="absolute -top-5 right-0 text-[10px] font-semibold text-negative-ink">En pérdida</span>
            </>
          )}
          <span className="absolute left-0 right-0 top-1/2 h-px bg-fg-subtle/40" />
          {r.posMedio !== null && (
            <span className="absolute top-0 bottom-0 border-l border-dashed border-fg-muted" style={{ left: `${r.posMedio}%` }} />
          )}
          {r.circulos.map(c => (
            <span key={c.lotId} data-testid="regla-compra"
              onMouseEnter={() => setActivo(c)} onMouseLeave={() => setActivo(a => (a?.lotId === c.lotId ? null : a))}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-shadow
                ${c.enBeneficio === null ? 'bg-fg-subtle/30 border-fg-subtle' : c.enBeneficio ? 'bg-positive/35 border-positive' : 'bg-negative/35 border-negative'}
                ${activo?.lotId === c.lotId ? 'ring-2 ring-brand z-10' : ''}`}
              style={{ left: `${c.pos}%`, width: c.radio * 2, height: c.radio * 2 }} />
          ))}
          {r.posPrecio !== null && (
            <span className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-brand" style={{ left: `${r.posPrecio}%` }} />
          )}
        </div>
        <div className="relative h-4 mt-1 text-[10px] mono tabular-nums text-fg-subtle">
          <span className="absolute left-0">{formatPrice(r.min, currency)}</span>
          {r.posPrecio !== null && (
            <span className="absolute -translate-x-1/2 font-semibold text-brand-ink whitespace-nowrap bg-background-card px-1"
              style={{ left: `${Math.min(88, Math.max(12, r.posPrecio))}%` }}>
              Actual {formatPrice(price, currency)}
            </span>
          )}
          <span className="absolute right-0">{formatPrice(r.max, currency)}</span>
        </div>
      </div>

      <p className="text-[11px] text-fg-muted min-h-4" aria-live="polite">
        {activo
          ? <>Compra del {formatLotDate(activo.openedAt)}: <span className="mono">{formatAmount(activo.quantity)} {asset}</span> a <span className="mono">{formatPrice(activo.price, currency)}</span>
              {activo.enBeneficio !== null && (activo.enBeneficio ? ', en beneficio' : ', en pérdida')}.</>
          : <span className="text-fg-subtle">Cada círculo es una compra abierta; cuanto más grande, más cantidad. Pasa el ratón por uno para ver su detalle.
              {r.posMedio !== null && ' La raya discontinua es tu precio medio.'}{r.log && ' Escala logarítmica: los precios están muy dispersos.'}</span>}
      </p>

      {r.posPrecio !== null && (
        <div className="grid grid-cols-2 gap-2">
          <Lado titulo="Más barato que ahora (en beneficio)" lado={r.beneficio} asset={asset} currency={currency} tono="positive" />
          <Lado titulo="Más caro que ahora (en pérdida)" lado={r.perdida} asset={asset} currency={currency} tono="negative" />
        </div>
      )}
    </div>
  )
}
