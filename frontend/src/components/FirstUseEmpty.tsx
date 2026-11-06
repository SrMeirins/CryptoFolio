import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PenLine, Upload } from 'lucide-react'
import { Button, buttonClasses, EmptyState } from './ui'
import { ManualTxModal } from './ManualTxModal'
import { invalidateTransactionQueries } from '../utils/queryInvalidation'

// Vacío de primer uso (#496): uno por página cuando no hay ninguna operación.
// Dice qué falta y ofrece importar o añadir una operación a mano (el mismo
// diálogo de Historial, abierto en el sitio). El enlace a la guía de primer uso
// llegará con #503 (`guideHref`).
export function FirstUseEmpty({ what, onAdd, guideHref }: {
  /** Qué mostrará la página cuando haya datos: «tu cartera», «el resumen fiscal». */
  what: string
  /** Abrir el alta manual de la página (Historial); si falta, se abre aquí. */
  onAdd?: () => void
  guideHref?: string
}) {
  const [adding, setAdding] = useState(false)
  const queryClient = useQueryClient()
  return (
    <>
      <EmptyState className="border border-dashed border-border rounded-xl"
        icon={<Upload size={30} />}
        title="Aún no hay operaciones"
        description={<>Importa el historial de tu exchange (Binance o Bitvavo) o añade una operación a mano para ver {what}.</>}
        action={
          <div data-empty="primer-uso" className="flex items-center justify-center gap-2 flex-wrap">
            <Link to="/import" className={buttonClasses('primary', 'sm')}><Upload size={13} aria-hidden="true" /> Importar</Link>
            <Button size="sm" icon={<PenLine size={13} aria-hidden="true" />} onClick={onAdd ?? (() => setAdding(true))}>Añadir a mano</Button>
            {guideHref && <Link to={guideHref} className="text-xs text-brand-ink hover:underline">Guía de primer uso</Link>}
          </div>
        } />
      {adding && (
        <ManualTxModal onClose={() => setAdding(false)}
          onSuccess={() => {
            setAdding(false)
            invalidateTransactionQueries(queryClient)
            void queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
          }} />
      )}
    </>
  )
}
