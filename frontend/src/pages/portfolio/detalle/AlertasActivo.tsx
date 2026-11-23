import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BellPlus } from 'lucide-react'
import { ApiError } from '../../../api/client'
import type { Alerta } from '../../../api/alertas'
import { Button, QueryError } from '../../../components/ui'
import { FilaAlerta } from '../../../components/alertas/FilaAlerta'
import { FormularioAlerta } from '../../../components/alertas/FormularioAlerta'
import { useAlertas } from '../../../hooks/useAlertas'
import type { Currency } from '../../../utils/format'

// Alertas de precio del activo en su detalle (#519): crear una (por encima o
// por debajo de un precio, en la moneda que se está viendo, una vez o cada
// vez) y las suyas con pausar y borrar. La gestión completa, en Ajustes.

export function AlertasActivo({ asset, price, currency, alertas }: {
  asset: string
  /** Precio actual en la moneda de visualización, para proponerlo. */
  price: number
  currency: Currency
  alertas: readonly Alerta[]
}) {
  const { q, crear, editar, borrar } = useAlertas()
  const [creando, setCreando] = useState(false)
  const error = crear.error instanceof ApiError ? (crear.error.body as { error?: string } | null)?.error ?? crear.error.message : crear.error ? 'No se pudo guardar la alerta' : null

  return (
    <div className="space-y-2" data-testid="alertas-activo">
      {q.isError && <QueryError what="las alertas" error={q.error} onRetry={() => void q.refetch()} />}
      {alertas.length > 0 && (
        <ul className="space-y-1.5">
          {alertas.map(a => (
            <FilaAlerta key={a.id} alerta={a} mostrarActivo={false}
              onPausar={activa => editar.mutate({ id: a.id, cambios: { activa } })}
              onBorrar={() => borrar.mutate(a.id)} />
          ))}
        </ul>
      )}
      {creando ? (
        <FormularioAlerta activo={asset} guardando={crear.isPending} error={error}
          inicial={{ sentido: 'por_encima', precio: Number(price.toPrecision(4)), moneda: currency, repeticion: 'una_vez' }}
          onCancelar={() => { setCreando(false); crear.reset() }}
          onGuardar={v => crear.mutate({ tipo: 'precio', activo: asset, ...v }, { onSuccess: () => setCreando(false) })} />
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" icon={<BellPlus size={14} aria-hidden="true" />} onClick={() => setCreando(true)}>Crear alerta de precio</Button>
          <Link to="/settings?tab=alertas" className="text-xs text-brand-ink hover:underline">Gestionar todas en Ajustes</Link>
        </div>
      )}
    </div>
  )
}
