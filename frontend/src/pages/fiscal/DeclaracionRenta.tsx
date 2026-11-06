import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileCheck2 } from 'lucide-react'
import { portfolioApi, type Declaracion } from '../../api/portfolio'
import { buttonClasses, Notice, Hint } from '../../components/ui'
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
      <Notice tipo="consejo" icon={FileCheck2} compact
        action={<button type="button" onClick={() => marcar.mutate()} disabled={busy} className={buttonClasses('secondary', 'sm')}>Marcar como declarada</button>}>
        ¿Ya presentaste la Renta de {year}? Márcala y guardaremos estas cifras para avisarte si cambian después.
        {error && <p role="alert" className="mt-1 text-negative">{error.message}</p>}
      </Notice>
    )
  }

  const cambios = declaracion.cambios ?? []
  const fecha = formatFiscalDate(declaracion.declaradoEn.slice(0, 10))
  const quitarMarca = <button type="button" onClick={() => quitar.mutate()} disabled={busy} className={buttonClasses('ghost', 'sm')}>Quitar marca</button>
  const errorMsg = error && <p role="alert" className="text-xs text-negative">{error.message}</p>

  if (cambios.length > 0) {
    return (
      <Notice tipo="aviso" role="status" title={<>Renta de {year} declarada el {fecha}: las cifras han cambiado desde entonces</>}
        action={<>
          <Hint label="Guarda las cifras actuales como las declaradas (p. ej. tras presentar una complementaria)">
            <button type="button" onClick={() => marcar.mutate()} disabled={busy} className={buttonClasses('secondary', 'sm')}
  >Actualizar marca</button>
          </Hint>
          {quitarMarca}
        </>}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {cambios.map(c => (
            <div key={c.campo} className="contents">
              <dt className="text-fg-subtle">{CAMPO_LABEL[c.campo] ?? c.campo}</dt>
              <dd className="mono">de {fmt(c.campo, c.declarado)} a <span className="text-fg font-semibold">{fmt(c.campo, c.actual)}</span></dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5">Si los datos nuevos son correctos, puede que necesites presentar una declaración complementaria. Consúltalo con tu asesor.</p>
        {errorMsg}
      </Notice>
    )
  }

  return (
    <div className="rounded-xl border border-positive/25 bg-positive/5 px-4 py-3 space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <CheckCircle2 size={15} className="text-positive shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-[14rem] text-fg-muted">Renta de {year} declarada el {fecha}. Las cifras coinciden con lo declarado.</p>
        {quitarMarca}
      </div>
      {errorMsg}
    </div>
  )
}
