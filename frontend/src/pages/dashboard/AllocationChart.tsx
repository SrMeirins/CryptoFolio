import { useMemo, useState } from 'react'
import { PieChart, AlertTriangle } from 'lucide-react'
import type { FifoLot, FiatBalance } from '../../api/portfolio'
import { usePortfolioValuation } from '../../hooks/usePortfolioValuation'
import { useDisplayMarket } from '../../hooks/useDisplayMarket'
import { formatPercent } from '../../utils/format'
import {
  allocationByAsset, allocationByWallet, assetColors, concentration, costesPorActivo, costesPorWallet, numeroEfectivo, pesoFrenteACoste,
  type AllocationItem, type AllocationMode,
} from '../../utils/allocation'
import { allocationSubtitle } from '../../utils/panelSubtitles'
import { InfoTooltip } from '../../components/InfoTooltip'
import { PanelHeader, SegmentedControl, badgeClasses, panelSurface, NotApplicable } from '../../components/ui'
import { AnilloDistribucion } from './distribucion/AnilloDistribucion'
import { Diversificacion } from './distribucion/Diversificacion'
import { FilaDistribucion } from './distribucion/FilaDistribucion'
import { COLUMNAS } from './distribucion/columnas'

// Distribución de la cartera (#235): anillo interactivo con el total en el
// centro y lista por activo o por wallet; agrupa en «Otros» lo que pasa de 8
// elementos y avisa si un activo concentra más del 40 %. Desde #514: segmento
// enfocado realzado, lista con cabeceras y degradado por peso, peso frente a
// coste, variación 24 h también por wallet, diversificación (número efectivo),
// iconos en «Otros», animación al cambiar de vista y dos destinos por fila
// (Portfolio e Historial).

const MODE_KEY = 'cflio_allocation_mode'
const readMode = (): AllocationMode => { try { return localStorage.getItem(MODE_KEY) === 'wallet' ? 'wallet' : 'asset' } catch { return 'asset' } }

export function AllocationChart({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const { currency, prices, open24, rate, dustThreshold } = useDisplayMarket()
  const [mode, setMode] = useState<AllocationMode>(readMode)
  const [active, setActive] = useState<string | null>(null)
  // Fila desplegada: «Otros» o una wallet con su desglose por activo (#506).
  const [open, setOpen] = useState<string | null>(null)

  const { assets, totalValue: total } = usePortfolioValuation(lots, fiatBalances)
  const items = useMemo<AllocationItem[]>(
    () => (mode === 'asset'
      ? allocationByAsset(assets, open24)
      : allocationByWallet(lots, fiatBalances, prices, rate ?? 0, undefined, dustThreshold, assetColors(assets), open24)),
    [mode, assets, open24, lots, fiatBalances, prices, rate, dustThreshold],
  )
  // Peso frente a coste con el coste en euros: es una proporción, no depende de la moneda visible.
  const pesos = useMemo(
    () => pesoFrenteACoste(items, mode === 'asset' ? costesPorActivo(lots, fiatBalances) : costesPorWallet(lots, fiatBalances)),
    [items, mode, lots, fiatBalances],
  )
  const diversificacion = useMemo(() => numeroEfectivo(items), [items])
  const warn = mode === 'asset' ? concentration(items) : null
  // Sin posiciones (#496): el panel no queda en blanco.
  if (total === 0 || items.length === 0) {
    return (
      <div className={panelSurface('none', 'px-5 py-5 h-full')}>
        <PanelHeader icon={PieChart} title="Distribución" className="mb-4" />
        <NotApplicable>Sin posiciones abiertas que repartir.</NotApplicable>
      </div>
    )
  }

  const changeMode = (m: AllocationMode) => { setMode(m); setActive(null); setOpen(null); try { localStorage.setItem(MODE_KEY, m) } catch { /* solo esta sesión */ } }
  const cabecera = 'text-[10.5px] uppercase tracking-widest text-fg-subtle'

  return (
    <div className={panelSurface('none', 'px-5 py-5 h-full')}>
      <PanelHeader
        icon={PieChart}
        title="Distribución"
        className="mb-4"
        subtitle={allocationSubtitle(items.map(i => ({ name: i.label, value: i.value })), total, mode)}
        help={<>
          <p>Reparto del valor de la cartera por activo o por wallet. Cada fila abre su detalle en Portfolio; el icono del reloj, sus operaciones en el Historial.</p>
          <p>«Frente a coste» compara el peso en valor con el peso en lo invertido: +6 pp significa que pesa 6 puntos más de lo que pusiste, porque se ha revalorizado más que el resto.</p>
        </>}
        actions={<SegmentedControl label="Agrupar la distribución" variant="accent" value={mode} onChange={changeMode}
          options={[{ value: 'asset', label: 'Activo' }, { value: 'wallet', label: 'Wallet' }]} />}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <Diversificacion efectivo={diversificacion.efectivo} total={diversificacion.total} mode={mode} />
        {warn && (
          <p className={badgeClasses('warning', 'sm')}>
            <AlertTriangle size={12} aria-hidden="true" /> {warn.label} concentra el {formatPercent(warn.pct, 0)} de la cartera
          </p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr] items-center">
        <AnilloDistribucion items={items} mode={mode} active={active} total={total} currency={currency} onActive={setActive} />

        <div key={mode} className="min-w-0 animate-page-in">
          {/* Cabecera de columnas; cada fila lleva además su descripción completa en el enlace. */}
          <div className="flex items-center gap-2 sm:gap-3 px-2 pb-1.5 mb-1 border-b border-border">
            <span className={`flex-1 ${cabecera}`}>{mode === 'asset' ? 'Activo' : 'Wallet'}</span>
            <span className={`${COLUMNAS.valor} text-right ${cabecera}`}>Valor</span>
            <span className={`${COLUMNAS.peso} text-right ${cabecera}`}>Peso</span>
            <span className={`${COLUMNAS.coste} text-right ${cabecera}`}>
              <span className="inline-flex items-center justify-end gap-0.5">vs coste
                <InfoTooltip label="Qué es «vs coste»">
                  <p>Peso en valor menos peso en lo invertido, en puntos porcentuales. Positivo: pesa más en la cartera de lo que supuso en lo que pusiste (se ha revalorizado más que el resto); negativo: pesa menos.</p>
                </InfoTooltip>
              </span>
            </span>
            <span className={`${COLUMNAS.cambio} text-right ${cabecera}`}>24 h</span>
            <span aria-hidden="true" className={COLUMNAS.acciones} />
          </div>
          <ul className="space-y-0.5" onMouseLeave={() => setActive(null)}>
            {items.map(i => (
              <FilaDistribucion key={i.key} item={i} mode={mode} currency={currency} peso={pesos.get(i.key)}
                dimmed={active !== null && active !== i.key} open={open === i.key}
                onActive={setActive} onToggle={() => setOpen(o => (o === i.key ? null : i.key))} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
