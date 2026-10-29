import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type AssetMetadata } from '../../api/portfolio'
import { ApiError } from '../../api/client'
import { Search, Plus, RefreshCw, CheckCircle, X, Zap } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../hooks/useToast'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { FILTROS_PRECIO } from './assets/helpers'
import { AddAssetDialog } from './assets/AddAssetDialog'
import { AssetsTable } from './assets/AssetsTable'
import { AssetHealth } from './assets/AssetHealth'
import { AssetEditDrawer } from './assets/AssetEditDrawer'
import { matchesFilter, priceHealth, sortAssets, type AssetFilter, type SortColumn, type SortDirection } from './assets/assetRows'
import { T, alpha, ink } from '../../utils/colors'
import { buttonClasses, fieldClasses, iconButtonClasses, panelSurface, Pagination } from '../../components/ui'
import { paginate, type PageSize } from '../../utils/pagination'

// Activos en Ajustes (#450): salud de los precios, filtros rápidos (también
// «Estables y fiat»), buscador y una sola tabla ordenable por columna con
// logo, fuente, precio en la moneda elegida, estado y uso. Editar abre un
// panel lateral; borrar solo se ofrece para activos sin operaciones.

const FILTERS: readonly { value: AssetFilter; label: string; title: string }[] = [
  ...FILTROS_PRECIO,
  { value: 'estables', label: 'Estables y fiat', title: 'Stablecoins y monedas fiat' },
]

export function AssetsSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const market = useDisplayMarket()
  const [search, setSearch]               = useState('')
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)
  const [showAdd, setShowAdd]             = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [detectingAll, setDetectingAll]   = useState(false)
  const [detectResult, setDetectResult]   = useState<{ detected: number; failed: number } | null>(null)
  const [retrying, setRetrying]           = useState(false)
  const [page, setPage]                   = useState(1)
  const [pageSize, setPageSize]           = useState<PageSize>(25)
  const [sort, setSort]                   = useState<{ col: SortColumn; dir: SortDirection }>({ col: 'activo', dir: 'asc' })
  // Filtro rápido por estado del precio (#337) o estables (#450).
  const [filtro, setFiltro]               = useState<AssetFilter>('todos')

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: portfolioApi.getAssets,
  })

  // Precio en la moneda de visualización: el del feed en vivo o, si no llega, el de la API (en EUR).
  const rate = market.currency === 'EUR' ? 1 : market.rate
  const priceOf = useMemo(() => (a: AssetMetadata) =>
    market.prices[a.symbol] ?? (a.precio_actual != null && rate ? a.precio_actual * rate : null), [market.prices, rate])

  const health = useMemo(() => priceHealth(assets, priceOf), [assets, priceOf])
  const q = search.trim().toLowerCase()
  const visible = useMemo(() => sortAssets(
    assets.filter(a => (a.symbol.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q)) && matchesFilter(a, priceOf(a), filtro)),
    sort.col, sort.dir, priceOf,
  ), [assets, q, filtro, sort, priceOf])
  const pageData = paginate(visible, page, pageSize)
  const unknown = assets.filter(a => !a.is_stablecoin && a.price_source === 'unknown')
  const editing = assets.find(a => a.symbol === editingSymbol)

  function onSort(col: SortColumn) {
    setSort(s => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }))
    setPage(1)
  }

  async function handleDetectAll() {
    setDetectingAll(true)
    setDetectResult(null)
    try {
      const result = await portfolioApi.detectAllPairs()
      setDetectResult(result)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally { setDetectingAll(false) }
  }

  async function handleRetry() {
    setRetrying(true)
    try {
      await portfolioApi.retryPrices()
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Precios reintentados', 'Los que sigan sin precio aparecen como «Sin precio».')
    } catch (e) {
      toast.error('No se pudo reintentar', e instanceof ApiError && e.status === 429 ? 'Espera un minuto antes de volver a intentarlo.' : (e as Error).message)
    } finally { setRetrying(false) }
  }

  async function handleDelete(symbol: string) {
    try {
      await portfolioApi.deleteAsset(symbol)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } catch (e) {
      toast.error('Error al borrar el activo', (e as Error).message)
    }
    setConfirmDelete(null)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Cabecera fija */}
      <div className="shrink-0 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-medium">Activos y precios</h2>
            <p className="text-xs text-fg-subtle mt-0.5">Pares de precio en Binance. Se detectan solos al importar.</p>
          </div>
          <div className="flex items-center gap-2">
            {unknown.length > 0 && !detectingAll && (
              <button type="button" onClick={handleDetectAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: alpha(T.warning, 9), color: ink(T.warning) }}>
                <Zap size={12} aria-hidden="true" /> Detectar {unknown.length} sin precio
              </button>
            )}
            {detectingAll && (
              <span role="status" className="flex items-center gap-1.5 text-xs text-fg-muted px-3 py-2">
                <RefreshCw size={12} aria-hidden="true" className="animate-spin" /> Detectando...
              </span>
            )}
            <button type="button" onClick={() => setShowAdd(s => !s)} className={buttonClasses('primary', 'md', 'flex')}>
              <Plus size={14} aria-hidden="true" /> Añadir activo
            </button>
          </div>
        </div>

        {detectResult && (
          <div role="status" className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-positive/30 bg-positive/8 text-sm">
            <span className="flex items-center gap-2 text-positive-ink">
              <CheckCircle size={13} aria-hidden="true" />
              {detectResult.detected} actualizado{detectResult.detected !== 1 ? 's' : ''}
              {detectResult.failed > 0 && <span className="text-fg-muted">, {detectResult.failed} sin par en Binance</span>}
            </span>
            <button type="button" onClick={() => setDetectResult(null)} aria-label="Cerrar aviso" className={iconButtonClasses('sm')}><X size={13} aria-hidden="true" /></button>
          </div>
        )}

        {showAdd && (
          <AddAssetDialog
            onClose={() => setShowAdd(false)}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setShowAdd(false) }}
          />
        )}

        {/* Salud de los precios (#450) */}
        <AssetHealth health={health} retrying={retrying} onRetry={() => void handleRetry()} />

        {/* Filtros rápidos (#337, #450) y buscador */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar activos">
            {FILTERS.map(f => {
              const n = f.value === 'todos' ? assets.length : assets.filter(a => matchesFilter(a, priceOf(a), f.value)).length
              const activo = filtro === f.value
              return (
                <button key={f.value} type="button" aria-pressed={activo} title={f.title}
                  onClick={() => { setFiltro(f.value); setPage(1) }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
                    activo ? 'border-brand bg-brand/10 text-brand-ink' : 'border-border text-fg-muted hover:text-fg'}`}>
                  {f.label}
                  <span className={`mono text-[10px] px-1 rounded ${f.value === 'sin_precio' && n > 0 ? 'bg-negative/15 text-negative-ink' : 'bg-overlay/10'}`}>{n}</span>
                </button>
              )
            })}
          </div>
          <div className="relative flex-1 min-w-48 ml-auto max-w-sm">
            <Search size={13} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input type="search" placeholder="Buscar activo..." aria-label="Buscar activo" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} className={fieldClasses('md', false, 'pl-9')} />
          </div>
        </div>
      </div>

      {/* Tabla con su propio desplazamiento */}
      <div className={panelSurface('none', 'flex-1 min-h-0 overflow-y-auto mb-4')}>
        {isLoading
          ? <p role="status" className="py-8 text-center text-fg-subtle text-sm">Cargando activos...</p>
          : visible.length === 0
            ? <p className="py-8 text-center text-fg-subtle text-sm">Ningún activo con estos filtros.</p>
            : <AssetsTable assets={pageData.items} priceOf={priceOf} currency={market.currency} sort={sort} onSort={onSort}
                onEdit={setEditingSymbol} onDelete={setConfirmDelete} />}
        <Pagination page={pageData.page} pages={pageData.pages} from={pageData.from} to={pageData.to} total={pageData.total}
          size={pageSize} onPage={setPage} onSize={n => { setPageSize(n); setPage(1) }} label="activos" />
      </div>

      {editing && (
        <AssetEditDrawer asset={editing} onClose={() => setEditingSymbol(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['assets'] })} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar activo"
          message={`¿Borrar «${confirmDelete}»? Solo es posible si no tiene transacciones asociadas.`}
          confirmLabel="Borrar" danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
