import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, AlertTriangle, Download,
  FileText, Table, ChevronDown, ChevronUp, Info
} from 'lucide-react'
import { formatEur } from '../utils/format'

interface FiscalSummary {
  year: number
  esAnioEnCurso: boolean
  totalGanancias: number
  totalPerdidas: number
  netoPatrimonial: number
  numOperacionesPatrimoniales: number
  totalRendimientos: number
  numRendimientos: number
  valorTotal31Dic: number
  superaUmbral721: boolean
  umbral721: number
}

interface FiscalEvent {
  fecha: string
  tipo: string
  activoTransmitido: string
  cantidadTransmitida: number
  contrapartidaClave: string
  contrapartidaDescripcion: string
  valorTransmisionEur: number
  gastosTransmisionEur: number
  valorAdquisicionEur: number
  gastosAdquisicionEur: number
  gananciaPeridaEur: number
  wallet: string
  txId: string
}

interface RendimientoEvent {
  fecha: string
  tipo: string
  activo: string
  cantidad: number
  valorEur: number
  wallet: string
}

interface Modelo721Activo {
  asset: string
  wallet: string
  quantity: number
  costBasisEur: number
  precioEur: number
  valorEur: number
}

interface Modelo721 {
  year: number
  esAnioEnCurso: boolean
  fecha: string
  activos: Modelo721Activo[]
  totalValor: number
  superaUmbral: boolean
  umbral: number
  aviso: string
}

function pnlColor(val: number) {
  if (val > 0) return 'text-accent-green'
  if (val < 0) return 'text-accent-red'
  return 'text-gray-400'
}

function pnlBg(val: number) {
  if (val > 0) return 'bg-accent-green/5 border-accent-green/20'
  if (val < 0) return 'bg-accent-red/5 border-accent-red/20'
  return 'bg-background-tertiary border-border'
}

export function Fiscal() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [showEvents, setShowEvents] = useState(true)
  const [showRendimientos, setShowRendimientos] = useState(true)
  const [showModelo721, setShowModelo721] = useState(true)

  const { data: years = [] } = useQuery<number[]>({
    queryKey: ['fiscal-years'],
    queryFn: () => fetch('/api/fiscal/years').then(r => r.json()),
  })

  const activeYear = selectedYear ?? (years.length > 0 ? years[0] : null)

  const { data: summary, isLoading: summaryLoading } = useQuery<FiscalSummary>({
    queryKey: ['fiscal-summary-detail', activeYear],
    queryFn: () => fetch(`/api/fiscal/${activeYear}/summary`).then(r => r.json()),
    enabled: !!activeYear,
  })

  const { data: events, isLoading: eventsLoading } = useQuery<{
    fiscalEvents: FiscalEvent[]
    rendimientos: RendimientoEvent[]
  }>({
    queryKey: ['fiscal-events', activeYear],
    queryFn: () => fetch(`/api/fiscal/${activeYear}/events`).then(r => r.json()),
    enabled: !!activeYear,
  })

  const { data: modelo721 } = useQuery<Modelo721>({
    queryKey: ['fiscal-721', activeYear],
    queryFn: () => fetch(`/api/fiscal/${activeYear}/modelo721`).then(r => r.json()),
    enabled: !!activeYear,
  })

  function handleExport(format: string) {
    window.open(`/api/fiscal/${activeYear}/export?format=${format}`, '_blank')
  }

  if (!activeYear) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">
          No hay datos fiscales disponibles. Importa transacciones primero.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Modulo Fiscal</h1>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <Info size={12} />
          Informacion orientativa. Consulta con tu asesor fiscal.
        </div>
      </div>

      {/* Tabs por año */}
      <div className="flex gap-2">
        {years.map((year: number) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeYear === year
                ? 'bg-accent-blue text-white'
                : 'bg-background-tertiary text-gray-400 hover:text-white'
            }`}
          >
            {year}
            {year === new Date().getFullYear() && (
              <span className="ml-1.5 text-xs opacity-70">(en curso)</span>
            )}
          </button>
        ))}
      </div>

      {summaryLoading ? (
        <div className="text-gray-500 text-sm">Calculando resumen fiscal...</div>
      ) : summary && (
        <>
          {/* Cards de resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`card border ${pnlBg(summary.totalGanancias)}`}>
              <div className="text-xs text-gray-500 mb-1">Ganancias patrimoniales</div>
              <div className="text-xl font-bold mono text-accent-green">
                +{formatEur(summary.totalGanancias)}
              </div>
              <div className="text-xs text-gray-600 mt-1">Base del ahorro IRPF</div>
            </div>

            <div className={`card border ${pnlBg(summary.totalPerdidas)}`}>
              <div className="text-xs text-gray-500 mb-1">Perdidas patrimoniales</div>
              <div className="text-xl font-bold mono text-accent-red">
                {formatEur(summary.totalPerdidas)}
              </div>
              <div className="text-xs text-gray-600 mt-1">Compensables 4 anos</div>
            </div>

            <div className={`card border ${pnlBg(summary.netoPatrimonial)}`}>
              <div className="text-xs text-gray-500 mb-1">Neto a declarar</div>
              <div className={`text-xl font-bold mono ${pnlColor(summary.netoPatrimonial)}`}>
                {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {summary.numOperacionesPatrimoniales} operaciones
              </div>
            </div>

            <div className="card border border-border">
              <div className="text-xs text-gray-500 mb-1">Rendimientos cap. mob.</div>
              <div className="text-xl font-bold mono text-accent-amber">
                {formatEur(summary.totalRendimientos)}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {summary.numRendimientos} operaciones
              </div>
            </div>
          </div>

          {/* Modelo 721 */}
          {modelo721 && (
            <div className={`card border ${modelo721.superaUmbral ? 'border-accent-red/30 bg-accent-red/5' : 'border-border'}`}>
              <button
                onClick={() => setShowModelo721(!showModelo721)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-medium text-sm text-left">
                      Modelo 721 — Valoracion a 31 dic {activeYear}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {modelo721.esAnioEnCurso
                        ? 'Estimacion actual (ano en curso)'
                        : `Valoracion historica a ${modelo721.fecha}`
                      }
                    </p>
                  </div>
                  {modelo721.superaUmbral ? (
                    <span className="flex items-center gap-1 text-xs text-accent-red bg-accent-red/10 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={11} />
                      Supera 50.000 EUR
                    </span>
                  ) : (
                    <span className="text-xs text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">
                      No supera umbral
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-lg font-bold mono ${modelo721.superaUmbral ? 'text-accent-red' : 'text-white'}`}>
                      {formatEur(modelo721.totalValor)}
                    </div>
                    <div className="text-xs text-gray-500">de {formatEur(modelo721.umbral)} umbral</div>
                  </div>
                  {showModelo721
                    ? <ChevronUp size={14} className="text-gray-500" />
                    : <ChevronDown size={14} className="text-gray-500" />
                  }
                </div>
              </button>

              {showModelo721 && (
                <div className="mt-4 space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 uppercase tracking-wider border-b border-border">
                          <th className="text-left py-2">Activo</th>
                          <th className="text-right py-2">Cantidad</th>
                          <th className="text-right py-2">Precio EUR</th>
                          <th className="text-right py-2">Valor EUR</th>
                          <th className="text-left py-2">Custodia a 31 dic</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {modelo721.activos.map((a, i) => (
                          <tr key={i} className="hover:bg-background-tertiary/50">
                            <td className="py-2 font-bold mono">{a.asset}</td>
                            <td className="py-2 text-right mono text-gray-400">{a.quantity.toFixed(4)}</td>
                            <td className="py-2 text-right mono text-gray-400">{formatEur(a.precioEur)}</td>
                            <td className="py-2 text-right mono font-medium">{formatEur(a.valorEur)}</td>
                            <td className="py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                a.wallet_kind === 'exchange'
                                  ? 'bg-accent-amber/10 text-accent-amber'
                                  : 'bg-accent-blue/10 text-accent-blue'
                              }`}
                              style={a.wallet_kind !== 'exchange' ? { backgroundColor: `${a.wallet_color}15`, color: a.wallet_color } : undefined}>
                                {a.wallet_name}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border font-bold">
                          <td className="py-2" colSpan={3}>Total valoracion</td>
                          <td className="py-2 text-right mono">{formatEur(modelo721.totalValor)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Nota sobre precios */}
                  <div className="flex items-start gap-2 p-3 bg-background-tertiary rounded-lg text-xs text-gray-500">
                    <Info size={12} className="shrink-0 mt-0.5" />
                    Precios obtenidos de Binance API a fecha {modelo721.fecha}. La columna "Custodia" indica donde se encontraban los activos en esa fecha segun el historial de transferencias registrado.
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {modelo721.aviso}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabla G/P patrimonial */}
          {eventsLoading ? (
            <div className="text-gray-500 text-sm">Cargando eventos fiscales...</div>
          ) : events && (
            <>
              <div className="card p-0">
                <button
                  onClick={() => setShowEvents(!showEvents)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-gray-500" />
                    <span className="font-medium text-sm">
                      Ganancias y Perdidas Patrimoniales
                    </span>
                    <span className="text-xs text-gray-500">
                      ({events.fiscalEvents.length} operaciones)
                    </span>
                  </div>
                  {showEvents
                    ? <ChevronUp size={14} className="text-gray-500" />
                    : <ChevronDown size={14} className="text-gray-500" />
                  }
                </button>

                {showEvents && (
                  <div className="border-t border-border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 uppercase tracking-wider border-b border-border">
                          <th className="text-left px-4 py-2.5">Fecha</th>
                          <th className="text-left px-4 py-2.5">Activo</th>
                          <th className="text-left px-4 py-2.5">Contrapartida</th>
                          <th className="text-right px-4 py-2.5">Val. Transmision</th>
                          <th className="text-right px-4 py-2.5">Gtos. Transmision</th>
                          <th className="text-right px-4 py-2.5">Val. Adquisicion</th>
                          <th className="text-right px-4 py-2.5">Gtos. Adquisicion</th>
                          <th className="text-right px-4 py-2.5">G/P EUR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {events.fiscalEvents.map((e, i) => (
                          <tr key={i} className="hover:bg-background-tertiary/50">
                            <td className="px-4 py-2.5 mono text-gray-400">{e.fecha}</td>
                            <td className="px-4 py-2.5 font-bold mono">{e.activoTransmitido}</td>
                            <td className="px-4 py-2.5">
                              <span className="bg-background-tertiary px-1.5 py-0.5 rounded text-gray-300 font-mono">
                                {e.contrapartidaClave}
                              </span>
                              <span className="ml-1.5 text-gray-500">{e.contrapartidaDescripcion}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorTransmisionEur)}</td>
                            <td className="px-4 py-2.5 text-right mono text-gray-400">{formatEur(e.gastosTransmisionEur)}</td>
                            <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorAdquisicionEur)}</td>
                            <td className="px-4 py-2.5 text-right mono text-gray-400">{formatEur(e.gastosAdquisicionEur)}</td>
                            <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(e.gananciaPeridaEur)}`}>
                              {e.gananciaPeridaEur >= 0 ? '+' : ''}{formatEur(e.gananciaPeridaEur)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-bold">
                          <td className="px-4 py-2.5" colSpan={3}>Total</td>
                          <td className="px-4 py-2.5 text-right mono">
                            {formatEur(events.fiscalEvents.reduce((s, e) => s + e.valorTransmisionEur, 0))}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-gray-400">
                            {formatEur(events.fiscalEvents.reduce((s, e) => s + e.gastosTransmisionEur, 0))}
                          </td>
                          <td className="px-4 py-2.5 text-right mono">
                            {formatEur(events.fiscalEvents.reduce((s, e) => s + e.valorAdquisicionEur, 0))}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-gray-400">
                            {formatEur(events.fiscalEvents.reduce((s, e) => s + e.gastosAdquisicionEur, 0))}
                          </td>
                          <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(summary.netoPatrimonial)}`}>
                            {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Rendimientos */}
              {events.rendimientos.length > 0 && (
                <div className="card p-0">
                  <button
                    onClick={() => setShowRendimientos(!showRendimientos)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingDown size={15} className="text-gray-500" />
                      <span className="font-medium text-sm">Rendimientos del Capital Mobiliario</span>
                      <span className="text-xs text-gray-500">({events.rendimientos.length} operaciones)</span>
                    </div>
                    {showRendimientos
                      ? <ChevronUp size={14} className="text-gray-500" />
                      : <ChevronDown size={14} className="text-gray-500" />
                    }
                  </button>

                  {showRendimientos && (
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 uppercase tracking-wider border-b border-border">
                            <th className="text-left px-4 py-2.5">Fecha</th>
                            <th className="text-left px-4 py-2.5">Tipo</th>
                            <th className="text-left px-4 py-2.5">Activo</th>
                            <th className="text-right px-4 py-2.5">Cantidad</th>
                            <th className="text-right px-4 py-2.5">Valor EUR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {events.rendimientos.map((r, i) => (
                            <tr key={i} className="hover:bg-background-tertiary/50">
                              <td className="px-4 py-2.5 mono text-gray-400">{r.fecha}</td>
                              <td className="px-4 py-2.5 text-accent-amber">{r.tipo}</td>
                              <td className="px-4 py-2.5 font-bold mono">{r.activo}</td>
                              <td className="px-4 py-2.5 text-right mono text-gray-400">{r.cantidad.toFixed(6)}</td>
                              <td className="px-4 py-2.5 text-right mono font-medium text-accent-amber">
                                {formatEur(r.valorEur)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border font-bold">
                            <td className="px-4 py-2.5" colSpan={4}>Total rendimientos</td>
                            <td className="px-4 py-2.5 text-right mono text-accent-amber">
                              {formatEur(events.rendimientos.reduce((s, r) => s + r.valorEur, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Exportaciones */}
          <div className="card space-y-4">
            <h3 className="font-medium text-sm">Exportar datos fiscales {activeYear}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => handleExport('csv')}
                className="flex flex-col items-center gap-2 p-4 bg-background-tertiary hover:bg-border rounded-xl transition-colors"
              >
                <FileText size={20} className="text-accent-blue" />
                <span className="font-medium text-sm">CSV Modelo 100</span>
                <span className="text-xs text-gray-500">Todas las operaciones</span>
              </button>

              <button
                onClick={() => handleExport('rentaweb')}
                className="flex flex-col items-center gap-2 p-4 bg-background-tertiary hover:bg-border rounded-xl transition-colors"
              >
                <FileText size={20} className="text-accent-green" />
                <span className="font-medium text-sm">Renta Web</span>
                <span className="text-xs text-gray-500">Formato AEAT</span>
              </button>

              <button
                onClick={() => handleExport('excel')}
                className="flex flex-col items-center gap-2 p-4 bg-background-tertiary hover:bg-border rounded-xl transition-colors"
              >
                <Table size={20} className="text-accent-amber" />
                <span className="font-medium text-sm">Excel</span>
                <span className="text-xs text-gray-500">Para asesor fiscal</span>
              </button>

              <button
                onClick={() => handleExport('pdf')}
                className="flex flex-col items-center gap-2 p-4 bg-background-tertiary hover:bg-border rounded-xl transition-colors"
              >
                <Download size={20} className="text-accent-red" />
                <span className="font-medium text-sm">PDF</span>
                <span className="text-xs text-gray-500">Resumen formal</span>
              </button>
            </div>
          </div>

          {/* Aviso legal */}
          <div className="flex items-start gap-2 p-4 bg-background-tertiary rounded-xl text-xs text-gray-500">
            <Info size={13} className="shrink-0 mt-0.5" />
            Esta informacion es orientativa y no constituye asesoramiento fiscal.
            Los calculos se basan en el metodo FIFO segun la normativa espanola vigente.
            Consulta con un asesor fiscal antes de presentar tu declaracion de la renta.
          </div>
        </>
      )}
    </div>
  )
}