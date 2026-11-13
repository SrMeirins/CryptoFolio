import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileCheck2, ShieldCheck } from 'lucide-react'
import { portfolioApi } from '../../../api/portfolio'
import { buttonClasses, fieldClasses, Hint, Notice } from '../../../components/ui'
import { parseImporte } from '../../../utils/declaraciones'
import { formatEur } from '../../../utils/format'
import { formatFiscalDate } from '../../../utils/fiscalTable'
import type { Modelo721 } from '../types'
import { invalidar721 } from './invalidar721'

// Marca del 721 presentado (#311, #545): el mismo dato que el paso del 721 del
// estado de la declaración (#542). Al marcarlo, el servidor guarda el valor y
// las monedas por entidad, que fijan las reglas del incremento y la extinción.

export function PresentadoBloque({ data, year }: { data: Modelo721; year: number }) {
  const qc = useQueryClient()
  const [valor, setValor] = useState('')
  const marcar = useMutation({
    mutationFn: () => {
      const v = parseImporte(valor)
      return portfolioApi.marcar721(year, Number.isFinite(v) && v >= 0 ? v : undefined)
    },
    onSuccess: () => invalidar721(qc),
  })
  const quitar = useMutation({ mutationFn: () => portfolioApi.quitarDeclaracion(year, 'modelo721'), onSuccess: () => invalidar721(qc) })
  const busy = marcar.isPending || quitar.isPending
  const error = marcar.error ?? quitar.error

  if (data.presentado) {
    return (
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-positive/25 bg-positive/5 px-3 py-2.5 text-xs">
        <ShieldCheck size={14} className="text-positive shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-[12rem] text-fg-muted">
          Presentado el {formatFiscalDate(data.presentado.declaradoEn.slice(0, 10))} con <span className="mono text-fg">{formatEur(data.presentado.valor)}</span>.
          Se guardaron sus monedas por entidad para la regla de extinción del año siguiente.
        </p>
        <button type="button" onClick={() => quitar.mutate()} disabled={busy} className={buttonClasses('ghost', 'sm')}>Quitar marca</button>
        {error && <p role="alert" className="w-full text-negative">{error.message}</p>}
      </div>
    )
  }
  return (
    <Notice tipo="consejo" icon={FileCheck2} compact action={<>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Valor declarado en euros</span>
        <Hint label="Por defecto, el valor que computa a 31 de diciembre">
          <input type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} maxLength={16}
            placeholder={formatEur(data.veredicto.valorEur)} className={fieldClasses('sm', false, 'w-32 mono text-right')} />
        </Hint>
      </label>
      <button type="button" onClick={() => marcar.mutate()} disabled={busy} className={buttonClasses('secondary', 'sm')}>Marcar como presentado</button>
    </>}>
      ¿Lo presentaste? Guarda el valor declarado y sus monedas por entidad: fijan las reglas del incremento y de la extinción de los años siguientes.
      {error && <p role="alert" className="mt-1 text-negative">{error.message}</p>}
    </Notice>
  )
}
