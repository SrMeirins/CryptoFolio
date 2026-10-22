import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calculator, Hourglass, PiggyBank, Repeat, TrendingDown, TrendingUp } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { SaleSimulatorModal } from '../../components/SaleSimulatorModal'
import { buttonClasses, cardClasses, fieldClasses, Skeleton } from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { usePricesStore } from '../../store/pricesStore'
import { ink } from '../../utils/colors'
import { formatEur } from '../../utils/format'
import { formatFiscalQty } from '../../utils/fiscalTable'
import { sugerencias, type Sugerencia } from '../../utils/planificador'
import { FiscalChartCard } from './FiscalChartCard'

// Planificador de fin de año (#307): colchón sin tributar, pérdidas latentes
// aprovechables y ganancias que caben, con precios en vivo y el mismo motor
// fiscal que el simulador de venta (las cuotas las calcula el backend).

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`

function Fila({ s, nota, onSimular }: { s: Sugerencia; nota: React.ReactNode; onSimular: () => void }) {
  return (
    <li className="flex items-center gap-3 flex-wrap rounded-xl border border-border px-3 py-2.5">
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <CryptoIcon symbol={s.asset} size={22} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="mono font-semibold text-sm text-fg">{s.asset}</span>
            <span className="text-[11px] truncate" style={{ color: ink(s.walletColor) }}>{s.walletName}</span>
            {s.recompra && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-warning/10 text-warning-ink"
                title="Compraste este activo en los últimos 2 meses: la pérdida podría no computar este año (art. 33.5 LIRPF)">
                <Repeat size={10} aria-hidden="true" />recompra
              </span>
            )}
          </span>
          <span className="block text-[11px] text-fg-subtle">
            Vender <span className="mono text-fg-muted">{formatFiscalQty(s.quantity)}</span> de {formatFiscalQty(s.disponible)} (FIFO)
          </span>
        </span>
      </span>
      <span className="text-right">
        <span className={`block mono font-semibold text-sm ${s.pnl < 0 ? 'text-negative' : 'text-positive'}`}>{signed(s.pnl)}</span>
        <span className="block text-[11px] text-fg-subtle">{nota}</span>
      </span>
      <button type="button" onClick={onSimular} className={buttonClasses('secondary', 'sm', 'flex gap-1')}
        aria-label={`Simular la venta de ${formatFiscalQty(s.quantity)} ${s.asset} de ${s.walletName}`}>
        <Calculator size={12} aria-hidden="true" /> Simular
      </button>
    </li>
  )
}

export function PlanificadorTab() {
  const prices = usePricesStore(s => s.prices)
  const { data, isLoading, isError } = useQuery({ queryKey: ['fiscal-planner'], queryFn: portfolioApi.getFiscalPlanner, staleTime: 60_000 })
  const [simular, setSimular] = useState<Sugerencia | null>(null)
  const [extraInput, setExtraInput] = useState('')
  const extra = useDebounce(parseFloat(extraInput.replace(',', '.')), 350)

  const sug = useMemo(
    () => (data ? sugerencias(data.lotes, prices, data.colchon, data.comprasRecientes) : { perdidas: [], ganancias: [] }),
    [data, prices],
  )
  // Ahorro de IRPF de cada pérdida sugerida: importes al euro para no pedirlo en cada tic del precio.
  const perdidasKey = useDebounce(sug.perdidas.slice(0, 50).map(p => Math.round(p.pnl)), 800)
  const { data: cuotas } = useQuery({
    queryKey: ['fiscal-cuotas', perdidasKey],
    queryFn: () => portfolioApi.getFiscalCuotas(perdidasKey),
    enabled: perdidasKey.length > 0,
    staleTime: 60_000,
  })
  const { data: rapida } = useQuery({
    queryKey: ['fiscal-cuotas', 'rapida', extra],
    queryFn: () => portfolioApi.getFiscalCuotas([extra]),
    enabled: Number.isFinite(extra) && Math.abs(extra) <= 1e9,
    staleTime: 60_000,
  })

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
  if (isError || !data) return <p className="text-sm text-fg-subtle">No se pudo cargar el planificador.</p>

  const ahorro = (i: number) => (cuotas && cuotas.cuotas.length === perdidasKey.length ? Math.max(0, cuotas.cuotaBase - (cuotas.cuotas[i] ?? cuotas.cuotaBase)) : null)
  const rapidaCuota = rapida?.cuotas[0]

  return (
    <div className="space-y-5">
      {/* Colchón */}
      <section aria-labelledby="plan-colchon" className={cardClasses('md', 'bg-linear-to-br from-positive/8 to-transparent')}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 id="plan-colchon" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
              <PiggyBank size={13} aria-hidden="true" /> Ganancia sin tributar en {data.year}
            </h2>
            <p className="text-3xl font-bold mono tabular-nums text-positive mt-2">{formatEur(data.colchon)}</p>
            <p className="text-xs text-fg-subtle mt-1 max-w-md">
              Puedes realizar hasta esta ganancia antes del 31 de diciembre sin que suba tu cuota: la absorben las pérdidas del año y las pendientes de años anteriores.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div><dt className="text-fg-subtle">Neto del año</dt><dd className={`mono font-semibold ${data.netoAnio >= 0 ? 'text-positive' : 'text-negative'}`}>{signed(data.netoAnio)}</dd></div>
            <div><dt className="text-fg-subtle">Cuota actual</dt><dd className="mono font-semibold text-warning">{formatEur(data.cuotaActual)}</dd></div>
            <div><dt className="text-fg-subtle">Pérdidas pendientes</dt><dd className="mono font-semibold text-fg">{formatEur(data.pendienteVigente)}</dd></div>
            <div><dt className="text-fg-subtle">Rendimientos del año</dt><dd className="mono font-semibold text-fg">{formatEur(data.rendimientosAnio)}</dd></div>
          </dl>
        </div>
        {data.caducanEsteAnio > 0.01 && (
          <p className="mt-4 flex items-start gap-2 text-xs text-fg-muted rounded-xl border border-warning/25 bg-warning/5 px-3 py-2">
            <Hourglass size={13} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <span><span className="mono font-semibold text-warning">{formatEur(data.caducanEsteAnio)}</span> de ese colchón son pérdidas que caducan el 31 de diciembre: si no las usas este año, se pierden.</span>
          </p>
        )}
      </section>

      {/* Simulador rápido */}
      <FiscalChartCard icon={Calculator} title="¿Cuánto pagaría?">
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <label className="flex items-center gap-2">
            <span className="text-fg-muted">Si realizo</span>
            <input type="text" inputMode="decimal" value={extraInput} onChange={e => setExtraInput(e.target.value)} placeholder="1.000"
              aria-label="Ganancia o pérdida adicional en euros" maxLength={14} className={fieldClasses('sm', false, 'w-32 mono text-right')} />
            <span className="text-fg-muted">€ más de ganancia</span>
          </label>
          {rapidaCuota !== undefined && Number.isFinite(extra) && (
            <p aria-live="polite" className="text-fg-muted">
              pagaría <span className="mono font-semibold text-warning">{formatEur(rapidaCuota)}</span> en total
              {' '}(<span className="mono">{signed(rapidaCuota - data.cuotaActual)}</span> sobre lo actual)
              {extra > 0 && extra <= data.colchon && <span className="text-positive"> · dentro del colchón</span>}
            </p>
          )}
        </div>
        <p className="text-[11px] text-fg-subtle mt-2">Usa un número negativo para una pérdida. Cuota del ahorro con tus tramos de Ajustes.</p>
      </FiscalChartCard>

      {/* Pérdidas latentes */}
      <FiscalChartCard icon={TrendingDown} title="Pérdidas latentes que puedes realizar">
        {sug.perdidas.length === 0 ? (
          <p className="text-xs text-fg-subtle">No tienes posiciones con pérdida latente a los precios actuales.</p>
        ) : (
          <ul className="space-y-2">
            {sug.perdidas.map((s, i) => {
              const a = i < 50 ? ahorro(i) : null
              return (
                <Fila key={`${s.asset}-${s.walletId}`} s={s} onSimular={() => setSimular(s)}
                  nota={a === null ? '…' : a > 0.005
                    ? <>ahorra <span className="mono text-positive">{formatEur(a)}</span> de IRPF este año</>
                    : 'sin ganancias que compensar: queda pendiente 4 años'} />
              )
            })}
          </ul>
        )}
        {sug.perdidas.some(s => s.recompra) && (
          <p className="text-[11px] text-fg-subtle mt-3 flex items-start gap-1.5">
            <Repeat size={11} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
            Si vendes con pérdida, no vuelvas a comprar ese activo en los 2 meses siguientes, o la pérdida no computará hasta que vendas la recompra.
          </p>
        )}
      </FiscalChartCard>

      {/* Ganancias que caben */}
      {data.colchon > 0.005 && (
        <FiscalChartCard icon={TrendingUp} title="Ganancias que caben en el colchón">
          {sug.ganancias.length === 0 ? (
            <p className="text-xs text-fg-subtle">No tienes posiciones con ganancia latente a los precios actuales.</p>
          ) : (
            <ul className="space-y-2">
              {sug.ganancias.map(s => (
                <Fila key={`${s.asset}-${s.walletId}`} s={s} onSimular={() => setSimular(s)} nota="sin tributar" />
              ))}
            </ul>
          )}
          <p className="text-[11px] text-fg-subtle mt-3">Cada sugerencia usa el colchón por sí sola: si realizas varias, la suma no debe pasar de {formatEur(data.colchon)}. Realizar ganancia sin tributar sube tu precio de compra de cara al futuro.</p>
        </FiscalChartCard>
      )}

      <p className="text-[11px] text-fg-subtle">
        Cálculos con los precios en vivo y sin comisión; «Simular» muestra el resultado exacto con comisión e IRPF. Las ventas respetan FIFO dentro de cada wallet.
      </p>

      {simular && (
        <SaleSimulatorModal asset={simular.asset} totalQty={simular.disponible} currentPrice={prices[simular.asset] ?? 0}
          initialWalletId={simular.walletId} initialQty={simular.quantity} onClose={() => setSimular(null)} />
      )}
    </div>
  )
}
