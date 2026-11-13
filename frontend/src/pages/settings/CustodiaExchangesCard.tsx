import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { buttonClasses, QueryError } from '../../components/ui'
import { reglaDe, textoEstado, textoOrigen } from '../../utils/custodia721'
import type { CustodiaWallet721 } from '../fiscal/types'
import { CustodiaDialog } from '../fiscal/modelo721/CustodiaDialog'
import { SettingsCard } from './SettingsCard'

// Custodia de tus exchanges para el Modelo 721 en Ajustes (#545): lo mismo
// que en Fiscal. Los exchanges que la app importa van en una fila con todas
// sus subcuentas y su regla automática; el resto, una fila por wallet.

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

interface Fila { clave: string; titulo: string; wallets: CustodiaWallet721[]; exchange: string | null }

function filasDe(wallets: readonly CustodiaWallet721[], exchange: (clave: string | null) => string | null): Fila[] {
  const out: Fila[] = []
  for (const w of wallets) {
    const previa = w.regla ? out.find(f => f.clave === `regla:${w.regla}`) : undefined
    if (previa) previa.wallets.push(w)
    else out.push({ clave: w.regla ? `regla:${w.regla}` : w.walletId, titulo: exchange(w.regla) ?? w.nombre, wallets: [w], exchange: exchange(w.regla) })
  }
  return out
}

export function CustodiaExchangesCard({ index }: { index: number }) {
  const custodiaQ = useQuery({ queryKey: ['fiscal-custodia'], queryFn: portfolioApi.getCustodia })
  const [cambiar, setCambiar] = useState<Fila | null>(null)
  const reglas = custodiaQ.data?.reglas ?? []
  const filas = filasDe(custodiaQ.data?.wallets ?? [], c => reglaDe(reglas, c)?.exchange ?? null)

  return (
    <SettingsCard index={index} icon={MapPin} title="Custodia de tus exchanges (Modelo 721)"
      description="Solo computa para el 721 lo custodiado fuera de España. La app lo sabe sola para los exchanges que importa; el resto lo indicas tú.">
      {custodiaQ.isError && <QueryError what="la custodia de tus exchanges" error={custodiaQ.error} onRetry={() => void custodiaQ.refetch()} />}
      {filas.length > 0 && (
        <ul className="divide-y divide-border/60" aria-label="Custodia por exchange">
          {filas.map(f => {
            const estados = new Set(f.wallets.map(w => textoEstado(w.hoy.enEspana)))
            const hoy = f.wallets[0].hoy
            return (
              <li key={f.clave} className="flex items-center gap-3 flex-wrap py-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">
                    {f.titulo}{f.wallets.length > 1 && <span className="font-normal text-fg-subtle"> ({f.wallets.length} subcuentas)</span>}
                  </span>
                  <span className={`block ${hoy.enEspana === null ? 'text-warning-ink' : 'text-fg-muted'}`}>
                    {estados.size > 1 ? 'Varía según la subcuenta' : `${textoEstado(hoy.enEspana)}${hoy.entidad ? ` (${hoy.entidad.nombre})` : ''}`}
                  </span>
                  <span className="block text-fg-subtle">{textoOrigen(hoy.origen, f.exchange)}</span>
                </span>
                <button type="button" onClick={() => setCambiar(f)} aria-label={`Cambiar la custodia de ${f.titulo}`} className={buttonClasses('secondary', 'sm')}>
                  {hoy.origen === 'desconocido' ? 'Indicar' : 'Cambiar'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-fg-subtle">
        Su efecto, en <Link to="/fiscal?vista=modelo721" className={`text-brand-ink hover:underline rounded ${FOCO}`}>Fiscal, Modelo 721</Link>.
      </p>
      {cambiar && (
        <CustodiaDialog titulo={cambiar.titulo} wallets={cambiar.wallets.map(w => ({ id: w.walletId, nombre: w.nombre }))} onClose={() => setCambiar(null)} />
      )}
    </SettingsCard>
  )
}
