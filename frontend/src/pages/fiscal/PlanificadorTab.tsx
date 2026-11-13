import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Calculator, Check, ListPlus, Repeat, TrendingDown, TrendingUp } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { SaleSimulatorModal } from '../../components/SaleSimulatorModal'
import { buttonClasses, Notice, Skeleton, TextTooltip, NotApplicable, QueryError } from '../../components/ui'
import { usePricesStore } from '../../store/pricesStore'
import { ink } from '../../utils/colors'
import { formatEur, formatEurSigned } from '../../utils/format'
import { formatFiscalQty } from '../../utils/fiscalTable'
import { ahorroDe, importesPendientes, trocear } from '../../utils/ahorroIrpf'
import { sugerencias, type Sugerencia } from '../../utils/planificador'
import { useToast } from '../../hooks/useToast'
import { isTypingTarget } from '../../utils/fiscalHeader'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { today } from '../../utils/date'
import { saldos, textoPlan } from '../../utils/planVentas'
import { FiscalChartCard } from './FiscalChartCard'
import { ColchonBarra } from './plan/ColchonBarra'
import { PlanBarra } from './plan/PlanBarra'
import { usePlan } from './plan/usePlan'
import { VentaLibreDialog } from './plan/VentaLibreDialog'

// Planificador de fin de año (#307, #546): colchón sin tributar con su
// composición, pérdidas latentes aprovechables y ganancias que caben, con
// precios en vivo y el mismo motor fiscal que el simulador de venta. Las
// sugerencias y cualquier otra venta se añaden a un plan guardado, cuyo efecto
// conjunto se ve en la barra fija del pie. Atajos: A añade la sugerencia
// enfocada y P abre o cierra el plan (Supr, en la barra).

const signed = formatEurSigned

function Fila({ s, nota, enPlan, onSimular, onAnadir }: { s: Sugerencia; nota: ReactNode; enPlan: boolean; onSimular: () => void; onAnadir: () => void }) {
  function tecla(e: KeyboardEvent<HTMLLIElement>) {
    if (e.key.toLowerCase() !== 'a' || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target as Element)) return
    e.preventDefault()
    if (!enPlan) onAnadir()
  }
  return (
    <li tabIndex={0} onKeyDown={tecla} aria-label={`${s.asset} de ${s.walletName}. A: añadir al plan`}
      className="flex items-center gap-3 flex-wrap rounded-xl border border-border px-3 py-2.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <CryptoIcon symbol={s.asset} size={22} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="mono font-semibold text-sm text-fg">{s.asset}</span>
            <span className="text-[11px] truncate" style={{ color: ink(s.walletColor) }}>{s.walletName}</span>
            {s.recompra && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-warning/10 text-warning-ink"
><TextTooltip label="Regla de recompra" tip="Compraste este activo en los últimos 2 meses: la pérdida podría no computar este año (art. 33.5 LIRPF)"><Repeat size={10} aria-hidden="true" />recompra</TextTooltip></span>
            )}
          </span>
          <span className="block text-[11px] text-fg-subtle">
            Vender <span className="mono text-fg-muted">{formatFiscalQty(s.quantity)}</span> de {formatFiscalQty(s.disponible)} (FIFO global)
          </span>
        </span>
      </span>
      <span className="text-right">
        <span className={`block mono font-semibold text-sm ${s.pnl < 0 ? 'text-negative' : 'text-positive'}`}>{signed(s.pnl)}</span>
        <span className="block text-[11px] text-fg-subtle">{nota}</span>
      </span>
      <span className="flex items-center gap-2">
        <button type="button" onClick={onSimular} className={buttonClasses('ghost', 'sm', 'flex gap-1')}
          aria-label={`Simular la venta de ${formatFiscalQty(s.quantity)} ${s.asset} de ${s.walletName}`}>
          <Calculator size={12} aria-hidden="true" /> Simular
        </button>
        <button type="button" onClick={onAnadir} disabled={enPlan} className={buttonClasses('secondary', 'sm', 'flex gap-1')}
          aria-label={enPlan ? `${s.asset} de ${s.walletName} ya está en el plan` : `Añadir al plan la venta de ${formatFiscalQty(s.quantity)} ${s.asset} de ${s.walletName}`}>
          {enPlan ? <><Check size={12} aria-hidden="true" /> En el plan</> : <><ListPlus size={12} aria-hidden="true" /> Añadir al plan</>}
        </button>
      </span>
    </li>
  )
}

export function PlanificadorTab() {
  const prices = usePricesStore(s => s.prices)
  const plan = usePlan(prices)
  const qc = useQueryClient()
  const toast = useToast()
  const [planAbierto, setPlanAbierto] = useState(false)
  const [ventaLibre, setVentaLibre] = useState(false)
  // P abre o cierra el plan, salvo al escribir o con un diálogo abierto.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key.toLowerCase() !== 'p' || e.altKey || e.ctrlKey || e.metaKey) return
      if (isTypingTarget(document.activeElement) || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      setPlanAbierto(a => !a)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const plannerQ = useQuery({ queryKey: ['fiscal-planner'], queryFn: portfolioApi.getFiscalPlanner, staleTime: 60_000 })
  const { data, isLoading, isError, dataUpdatedAt } = plannerQ
  const [simular, setSimular] = useState<Sugerencia | null>(null)

  const sug = useMemo(
    () => (data ? sugerencias(data.lotes, prices, data.colchon, data.comprasRecientes) : { perdidas: [], ganancias: [] }),
    [data, prices],
  )
  // Ahorro de IRPF de cada pérdida sugerida (#533): caché de cuotas por importe
  // al euro, válida mientras no cambien los datos del planificador. Solo se
  // piden los importes que faltan, en trozos dentro del límite de la API, así
  // que con precios en vivo no hay una petición en cada tic ni se pierde el dato.
  const [cache, setCache] = useState<{ version: number; base: number | null; cuotas: Map<number, number> }>(
    () => ({ version: 0, base: null, cuotas: new Map() }))
  const vigente = cache.version === dataUpdatedAt ? cache : { version: dataUpdatedAt, base: null, cuotas: new Map<number, number>() }
  const pendientes = useMemo(
    () => importesPendientes(sug.perdidas.map(p => p.pnl), vigente.cuotas),
    [sug.perdidas, vigente.cuotas],
  )
  const cuotasQuery = useQuery({
    queryKey: ['fiscal-cuotas', dataUpdatedAt, pendientes],
    queryFn: async () => {
      const partes = await Promise.all(trocear(pendientes).map(t => portfolioApi.getFiscalCuotas(t).then(r => ({ t, r }))))
      return { version: dataUpdatedAt, base: partes[0].r.cuotaBase, pares: partes.flatMap(({ t, r }) => t.map((g, i) => [g, r.cuotas[i]] as const)) }
    },
    enabled: pendientes.length > 0,
    staleTime: 60_000,
  })
  // Cada respuesta nueva se incorpora a la caché una sola vez, durante el render
  // (patrón de React para derivar estado de un dato externo, sin efecto).
  const nuevas = cuotasQuery.data
  const [incorporadas, setIncorporadas] = useState(nuevas)
  if (nuevas && nuevas !== incorporadas) {
    setIncorporadas(nuevas)
    const previas = vigente.version === nuevas.version ? vigente.cuotas : new Map<number, number>()
    setCache({ version: nuevas.version, base: nuevas.base, cuotas: new Map([...previas, ...nuevas.pares]) })
  }

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
  if (isError || !data) return <QueryError what="el planificador" error={plannerQ.error} onRetry={() => void plannerQ.refetch()} compact={false} />

  const enPlan = (s: Sugerencia) => plan.ventas.some(v => v.asset === s.asset && v.walletId === s.walletId)
  const anadir = (s: Sugerencia) => {
    plan.cambiar([...plan.ventas, { asset: s.asset, walletId: s.walletId, walletNombre: s.walletName, cantidad: s.quantity, precioEur: null }])
    toast.success('Añadida al plan', `${formatFiscalQty(s.quantity)} ${s.asset} de ${s.walletName}`)
  }
  const archivados = plan.planQ.data?.archivados ?? []
  async function copiarArchivado(ejercicio: number) {
    try {
      const p = await portfolioApi.getPlan(ejercicio)
      await navigator.clipboard.writeText(textoPlan({ ejercicio, fecha: formatFiscalDate(today()), ventas: p.ventas, prices: {}, efecto: null, comisionPct: p.comisionPct }))
      toast.success(`Plan de ${ejercicio} copiado`)
    } catch (e) { toast.fail('No se pudo copiar el plan', e) }
  }
  async function borrarArchivado(ejercicio: number) {
    try {
      await portfolioApi.vaciarPlan(ejercicio)
      void qc.invalidateQueries({ queryKey: ['fiscal-plan'] })
      toast.success(`Plan de ${ejercicio} borrado`)
    } catch (e) { toast.fail('No se pudo borrar el plan', e) }
  }

  return (
    <div className="space-y-5">
      <ColchonBarra data={data} />

      {/* Pérdidas latentes */}
      <FiscalChartCard icon={TrendingDown} title="Pérdidas latentes que puedes realizar">
        {sug.perdidas.length === 0 ? (
          <NotApplicable>No tienes posiciones con pérdida latente a los precios actuales.</NotApplicable>
        ) : (
          <ul className="space-y-2">
            {sug.perdidas.map(s => {
              const a = ahorroDe(s.pnl, vigente.base, vigente.cuotas)
              return (
                <Fila key={s.asset} s={s} onSimular={() => setSimular(s)} enPlan={enPlan(s)} onAnadir={() => anadir(s)}
                  nota={a === null
                    ? (cuotasQuery.isError
                      ? <>No se pudo calcular el ahorro. <button type="button" onClick={() => void cuotasQuery.refetch()} className="text-brand-ink underline rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">Reintentar</button></>
                      : <span role="status" aria-label="Calculando el ahorro">…</span>)
                    : a > 0.005
                    ? <>ahorra <span className="mono text-positive">{formatEur(a)}</span> de IRPF este año</>
                    : 'sin ganancias que compensar: queda pendiente 4 años'} />
              )
            })}
          </ul>
        )}
        {sug.perdidas.some(s => s.recompra) && (
          <Notice tipo="consejo" icon={Repeat} compact className="mt-3">
            Si vendes con pérdida, no vuelvas a comprar ese activo en los 2 meses siguientes, o la pérdida no computará hasta que vendas la recompra.
          </Notice>
        )}
      </FiscalChartCard>

      {/* Ganancias que caben */}
      {data.colchon > 0.005 && (
        <FiscalChartCard icon={TrendingUp} title="Ganancias que caben en el colchón">
          {sug.ganancias.length === 0 ? (
            <NotApplicable>No tienes posiciones con ganancia latente a los precios actuales.</NotApplicable>
          ) : (
            <ul className="space-y-2">
              {sug.ganancias.map(s => (
                <Fila key={s.asset} s={s} onSimular={() => setSimular(s)} enPlan={enPlan(s)} onAnadir={() => anadir(s)} nota="sin tributar" />
              ))}
            </ul>
          )}
          <p className="text-[11px] text-fg-subtle mt-3">Cada sugerencia usa el colchón por sí sola; añádelas al plan para ver su efecto conjunto y si pasan de {formatEur(data.colchon)}. Realizar ganancia sin tributar sube tu precio de compra de cara al futuro.</p>
        </FiscalChartCard>
      )}

      {archivados.map(a => (
        <Notice key={a.ejercicio} tipo="informacion" icon={Archive} compact action={<>
          <button type="button" onClick={() => void copiarArchivado(a.ejercicio)} className={buttonClasses('ghost', 'sm')}>Copiar</button>
          <button type="button" onClick={() => void borrarArchivado(a.ejercicio)} className={buttonClasses('ghost', 'sm')}>Borrar</button>
        </>}>
          Tienes guardado el plan de {a.ejercicio} ({a.ventas} {a.ventas === 1 ? 'venta' : 'ventas'}): ya no se calcula, pero puedes copiarlo como texto.
        </Notice>
      ))}

      <p className="text-[11px] text-fg-subtle">
        Sugerencias con los precios en vivo y sin comisión; «Simular» muestra el resultado exacto con comisión e IRPF, y el plan suma el efecto de todas sus ventas. Las ventas siguen el FIFO global por activo: salen primero las unidades compradas antes, estén en la wallet que estén.
      </p>

      <PlanBarra plan={plan} prices={prices} abierto={planAbierto} setAbierto={setPlanAbierto} onVentaLibre={() => setVentaLibre(true)} />

      {ventaLibre && (
        <VentaLibreDialog disponibles={saldos(data.lotes)} prices={prices} onClose={() => setVentaLibre(false)}
          onAdd={v => { plan.cambiar([...plan.ventas, v]); setPlanAbierto(true); toast.success('Añadida al plan', `${v.asset} de ${v.walletNombre}`) }} />
      )}

      {simular && (
        <SaleSimulatorModal asset={simular.asset} totalQty={simular.disponible} currentPrice={prices[simular.asset] ?? 0}
          initialWalletId={simular.walletId} initialQty={simular.quantity} onClose={() => setSimular(null)} />
      )}
    </div>
  )
}
