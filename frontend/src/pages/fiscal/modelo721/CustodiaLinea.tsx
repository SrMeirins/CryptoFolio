import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../../../api/portfolio'
import { buttonClasses } from '../../../components/ui'
import { reglaDe, textoEstado, textoOrigen } from '../../../utils/custodia721'
import { CustodiaDialog } from './CustodiaDialog'

// Custodia de una wallet de exchange en Ajustes > Wallets (#545): dónde está
// hoy, cómo se sabe y «Cambiar», con el mismo diálogo que en Fiscal.

export function CustodiaLinea({ wallet }: { wallet: { id: string; name: string } }) {
  const custodiaQ = useQuery({ queryKey: ['fiscal-custodia'], queryFn: portfolioApi.getCustodia })
  const [abierto, setAbierto] = useState(false)
  const w = custodiaQ.data?.wallets.find(x => x.walletId === wallet.id)
  const regla = reglaDe(custodiaQ.data?.reglas ?? [], w?.regla ?? null)
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="text-fg-subtle">Custodia (Modelo 721):</span>
      {custodiaQ.isError ? <span className="text-negative-ink">no se pudo cargar</span>
        : !w ? <span className="text-fg-subtle">cargando</span>
        : (
          <span className={w.hoy.enEspana === null ? 'text-warning-ink' : 'text-fg-muted'}>
            {textoEstado(w.hoy.enEspana)}{w.hoy.entidad ? ` (${w.hoy.entidad.nombre})` : ''}.{' '}
            <span className="text-fg-subtle">{textoOrigen(w.hoy.origen, regla?.exchange ?? null)}</span>
          </span>
        )}
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={`Cambiar la custodia de ${wallet.name}`}
        className={buttonClasses('ghost', 'sm', 'px-1.5')}>Cambiar</button>
      {abierto && <CustodiaDialog titulo={regla?.exchange ?? wallet.name} wallets={[{ id: wallet.id, nombre: wallet.name }]} onClose={() => setAbierto(false)} />}
    </div>
  )
}
