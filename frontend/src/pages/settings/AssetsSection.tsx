import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type AssetMetadata } from '../../api/portfolio'
import { Search, Plus, RefreshCw, CheckCircle, AlertCircle, ChevronDown, X, Zap } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../hooks/useToast'
import { usePricesStore } from '../../store/pricesStore'
import { type SortKey, type SortDir, type FiltroPrecio, FILTROS_PRECIO, cumpleFiltro } from './assets/helpers'
import { SortButton } from './assets/SortButton'
import { AssetItem } from './assets/AssetItem'
import { AddAssetDialog } from './assets/AddAssetDialog'
import { T, alpha, ink } from '../../utils/colors'
import { buttonClasses, iconButtonClasses, Pagination } from '../../components/ui'
import { paginate, type PageSize } from '../../utils/pagination'
import { fieldClasses } from '../../components/ui'

export function AssetsSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const prices = usePricesStore(s => s.prices)
  const [search, setSearch]             = useState('')
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [detectingAll, setDetectingAll] = useState(false)
  const [detectResult, setDetectResult] = useState<{ detected: number; failed: number } | null>(null)
  const [showStablecoins, setShowStablecoins] = useState(false)
  const [page, setPage]                 = useState(1)
  const [pageSize, setPageSize]         = useState<PageSize>(25)
  const [sortKey, setSortKey]           = useState<SortKey>('name')
  const [sortDir, setSortDir]           = useState<SortDir>('asc')
  // Filtro rápido por estado del precio (#337).
  const [filtro, setFiltro]             = useState<FiltroPrecio>('todos')

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: portfolioApi.getAssets,
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  const precioDe = (a: AssetMetadata) => prices[a.symbol] ?? a.precio_actual
  const conteo = (f: FiltroPrecio) => assets.filter(a => cumpleFiltro(a, precioDe(a), f)).length
  const filtered = assets.filter(a =>
    (a.symbol.toLowerCase().includes(search.toLowerCase()) ||
     a.name?.toLowerCase().includes(search.toLowerCase())) &&
    cumpleFiltro(a, precioDe(a), filtro)
  )

  function sortAssets(list: AssetMetadata[]): AssetMetadata[] {
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name')   cmp = (a.name ?? a.symbol).localeCompare(b.name ?? b.symbol)
      if (sortKey === 'source') cmp = a.price_source.localeCompare(b.price_source)
      if (sortKey === 'price') {
        const pa = prices[a.symbol] ?? -1
        const pb = prices[b.symbol] ?? -1
        cmp = pa - pb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const stablecoins = filtered.filter(a => a.is_stablecoin || a.price_source === 'fiat')
  const unknown     = filtered.filter(a => !a.is_stablecoin && a.price_source === 'unknown')
  const normal      = sortAssets(filtered.filter(a => !a.is_stablecoin && a.price_source !== 'unknown' && a.price_source !== 'fiat'))

  // Paginación común (#444), con el tamaño de página elegible.
  const pageData    = paginate(normal, page, pageSize)
  const normalPaged = pageData.items

  async function handleDetectAll() {
    setDetectingAll(true)
    setDetectResult(null)
    try {
      const result = await portfolioApi.detectAllPairs()
      setDetectResult(result)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally { setDetectingAll(false) }
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

  // Wiring común a las 3 listas (sin precio / normal / stablecoins) —
  // antes repetido literalmente en cada .map().
  function renderAssetItem(a: AssetMetadata) {
    return (
      <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
        onEdit={() => setEditingSymbol(prev => prev === a.symbol ? null : a.symbol)}
        onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
        onDelete={() => setConfirmDelete(a.symbol)} />
    )
  }

  const inputSearch = fieldClasses('md', false, 'pl-9')

  return (
    <div className="h-full flex flex-col">
      {/* Header fijo */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Activos y precios</h2>
            <p className="text-xs text-fg-subtle mt-0.5">Pares de precio en Binance. Se auto-detectan al importar.</p>
          </div>
          <div className="flex items-center gap-2">
            {unknown.length > 0 && !detectingAll && (
              <button type="button" onClick={handleDetectAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: alpha(T.warning, 9), color: ink(T.warning) }}>
                <Zap size={12} /> Detectar {unknown.length} sin precio
              </button>
            )}
            {detectingAll && (
              <span className="flex items-center gap-1.5 text-xs text-fg-muted px-3 py-2">
                <RefreshCw size={12} className="animate-spin" /> Detectando...
              </span>
            )}
            <button type="button" onClick={() => setShowAdd(s => !s)}
              className={buttonClasses('primary', 'md', 'flex')}>
              <Plus size={14} /> Añadir activo
            </button>
          </div>
        </div>

        {detectResult && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-positive/30 bg-positive/8 text-sm">
            <span className="flex items-center gap-2 text-positive">
              <CheckCircle size={13} />
              {detectResult.detected} actualizado{detectResult.detected !== 1 ? 's' : ''}
              {detectResult.failed > 0 && <span className="text-fg-muted">, {detectResult.failed} sin par en Binance</span>}
            </span>
            <button type="button" onClick={() => setDetectResult(null)} aria-label="Cerrar aviso" className={iconButtonClasses('sm')}><X size={13} /></button>
          </div>
        )}

        {showAdd && (
          <AddAssetDialog
            onClose={() => setShowAdd(false)}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setShowAdd(false) }}
          />
        )}

        {/* Filtros rápidos por estado del precio (#337) */}
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por estado del precio">
          {FILTROS_PRECIO.map(f => {
            const n = f.value === 'todos' ? assets.length : conteo(f.value)
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

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input placeholder="Buscar activo..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} className={inputSearch} />
            {!search && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">{assets.length} activos</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-fg-subtle mr-1">Ordenar:</span>
            <SortButton label="Nombre" sortKey="name"   active={sortKey} dir={sortDir} onClick={handleSort} />
            <SortButton label="Precio" sortKey="price"  active={sortKey} dir={sortDir} onClick={handleSort} />
            <SortButton label="Fuente" sortKey="source" active={sortKey} dir={sortDir} onClick={handleSort} />
          </div>
        </div>
      </div>

      {/* Lista con scroll */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isLoading && <div className="py-8 text-center text-fg-subtle text-sm">Cargando...</div>}

        {unknown.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <AlertCircle size={12} className="text-negative" />
              <span className="text-xs font-medium text-negative">{unknown.length} sin precio configurado</span>
            </div>
            {unknown.map(renderAssetItem)}
          </div>
        )}

        {normal.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {normalPaged.map(renderAssetItem)}
            </div>
            <Pagination page={pageData.page} pages={pageData.pages} from={pageData.from} to={pageData.to} total={pageData.total}
              size={pageSize} onPage={setPage} onSize={n => { setPageSize(n); setPage(1) }} label="activos" />
          </div>
        )}

        {stablecoins.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowStablecoins(s => !s)} aria-expanded={showStablecoins}
              className="flex items-center gap-2 text-xs text-fg-subtle hover:text-fg-muted transition-colors py-1 px-1">
              <ChevronDown size={12} className={`transition-transform duration-200 ${showStablecoins ? 'rotate-180' : ''}`} />
              {stablecoins.length} stablecoins y fiat
            </button>
            {showStablecoins && (
              <div className="space-y-1.5 mt-2">
                {stablecoins.map(renderAssetItem)}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar activo"
          message={`Borrar "${confirmDelete}"? Solo es posible si no tiene transacciones asociadas.`}
          confirmLabel="Borrar" danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
