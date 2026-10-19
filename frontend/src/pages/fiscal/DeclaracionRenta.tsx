import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileCheck2 } from 'lucide-react'
import { portfolioApi, type Declaracion } from '../../api/portfolio'
import { buttonClasses } from '../../components/ui'
import { formatEur } from '../../utils/format'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { CAMPO_LABEL } from '../../utils/declaraciones'

// Renta declarada de un ejercicio cerrado (#311): marcarla guarda las cifras
// del momento; si después cambian (p. ej. por una importación), se avisa cifra
// a cifra y se puede actualizar la marca o quitarla.

const fmt = (campo: string, v: number) => (campo === 'operaciones' ? String(v) : formatEur(v))

export function DeclaracionRenta({ year, declaracion }: { year: number; declaracion: Declaracion | undefined }) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['fiscal-declaraciones'] })
  const marcar = useMutation({ mutationFn: () => portfolioApi.marcarRenta(year), onSuccess: refresh })
  const quitar = useMutation({ mutationFn: () => portfolioApi.quitarDeclaracion(year, 'renta'), onSuccess: refresh })
  const busy = marcar.isPending || quitar.isPending
  const error = marcar.error ?? quitar.error

  if (!declaracion) {
    return (
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border px-4 py-2.5 text-sm">
        <FileCheck2 size={15} className="text-fg-subtle shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-[14rem] text-fg-muted">
          ¿Ya presentaste la Renta de {year}? Márcala y guardaremos estas cifras para avisarte si cambian después.
        </p>
        <button type="button" onClick={() => marcar.mutate()} disabled={busy} className={buttonClasses('secondary', 'sm')}>Marcar como declarada</button>
        {error && <p role="alert" className="w-full text-xs text-negative">{error.message}</p>}
      </div>
    )
  }

  const cambios = declaracion.cambios ?? []
  const fecha = formatFiscalDate(declaracion.declaradoEn.slice(0, 10))
  return (
    <div role={cambios.length > 0 ? 'alert' : undefined}
      className={`rounded-xl border px-4 py-3 space-y-2 text-sm ${cambios.length > 0 ? 'border-warning/30 bg-warning/5' : 'border-positive/25 bg-positive/5'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {cambios.length > 0
          ? <AlertTriangle size={15} className="text-warning shrink-0" aria-hidden="true" />
          : <CheckCircle2 size={15} className="text-positive shrink-0" aria-hidden="true" />}
        <p className="flex-1 min-w-[14rem] text-fg-muted">
          Renta de {year} declarada el {fecha}.{' '}
          {cambios.length > 0
            ? <span className="text-warning font-medium">Las cifras han cambiado desde entonces.</span>
            : 'Las cifras coinciden con lo declarado.'}
        </p>
        {cambios.length > 0 && (
          <button type="button" onClick={() => marcar.mutate()} disabled={busy} className={buttonClasses('secondary', 'sm')}
            title="Guarda las cifras actuales como las declaradas (p. ej. tras presentar una complementaria)">Actualizar marca</button>
        )}
        <button type="button" onClick={() => quitar.mutate()} disabled={busy} className={buttonClasses('ghost', 'sm')}>Quitar marca</button>
      </div>
      {cambios.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs pl-7">
          {cambios.map(c => (
            <div key={c.campo} className="contents">
              <dt className="text-fg-subtle">{CAMPO_LABEL[c.campo] ?? c.campo}</dt>
              <dd className="mono text-fg-muted">{fmt(c.campo, c.declarado)} → <span className="text-fg font-semibold">{fmt(c.campo, c.actual)}</span></dd>
            </div>
          ))}
        </dl>
      )}
      {cambios.length > 0 && (
        <p className="text-[11px] text-fg-subtle pl-7">Si los datos nuevos son correctos, puede que necesites presentar una declaración complementaria. Consúltalo con tu asesor.</p>
      )}
      {error && <p role="alert" className="text-xs text-negative">{error.message}</p>}
    </div>
  )
}
