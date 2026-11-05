import { useState } from 'react'
import { Coins, Settings, Wallet } from 'lucide-react'
import { PageHeader, StatCard, StatStrip } from '../../components/ui'
import { formatMoney } from '../../utils/format'

// Página de prueba de los componentes comunes (épica #479). Solo existe en
// desarrollo (App.tsx la monta con import.meta.env.DEV y no llega al build de
// producción): sirve para revisarlos a mano y para pasar axe en los e2e.
// Datos sintéticos.

const eur = (v: number) => formatMoney(v, 'EUR')

export function ComponentesDev() {
  const [ultimo, setUltimo] = useState('ninguna')
  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <PageHeader icon={Settings} title="Componentes comunes" subtitle="Página de prueba (solo en desarrollo)" />

      <section aria-labelledby="dev-statstrip" className="space-y-3">
        <h2 id="dev-statstrip" className="text-sm font-semibold">StatStrip</h2>
        <StatStrip label="Tira de prueba" cells={[
          { key: 'a', label: 'Operaciones', value: 128, format: v => String(Math.round(v)), sub: 'en 2025' },
          { key: 'b', label: 'Ganancias', value: 1234.5, format: eur, tone: 'positive', to: '/fiscal?vista=operaciones&resultado=ganancia', destination: 'Operaciones' },
          { key: 'c', label: 'Pérdidas', value: -321.75, format: eur, tone: 'negative', onSelect: () => setUltimo('Pérdidas'), destination: 'Operaciones' },
          { key: 'd', label: 'Caducan', value: '2 años', tone: 'warning', sub: 'este 31 dic' },
          { key: 'e', label: 'Sin datos', value: '—' },
        ]} />
        <p role="status" className="text-xs text-fg-subtle">Última celda pulsada: {ultimo}</p>
      </section>

      <section aria-labelledby="dev-statcard" className="space-y-3">
        <h2 id="dev-statcard" className="text-sm font-semibold">StatCard con huecos reservados</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Valor" icon={Wallet} color="var(--cf-brand)" value={12480} format={eur} reserveSlots
            chip={<span className="text-xs text-fg-muted">24 h +1,2 %</span>} series={[10, 12, 11, 14, 13, 15]} />
          <StatCard title="Coste" icon={Coins} color="var(--cf-info)" value={10900} format={eur} reserveSlots />
          <StatCard title="Sin serie" icon={Coins} color="var(--cf-warning)" value={42} format={eur} reserveSlots
            chip={<span className="text-xs text-fg-muted">3 activos</span>} />
        </div>
      </section>
    </div>
  )
}
