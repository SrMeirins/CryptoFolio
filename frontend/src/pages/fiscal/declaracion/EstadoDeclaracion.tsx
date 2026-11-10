import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { portfolioApi, type Declaracion } from '../../../api/portfolio'
import { buttonClasses, Hint } from '../../../components/ui'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useToast } from '../../../hooks/useToast'
import { formatEur, formatNumber } from '../../../utils/format'
import { formatFiscalDate } from '../../../utils/fiscalTable'
import { pasosEjercicio, progresoPasos, type DatosEjercicio, type Paso } from '../../../utils/pasosDeclaracion'
import { FiscalChartCard } from '../FiscalChartCard'
import { PasoDeclaracion, type Conector } from './PasoDeclaracion'
import { TablaDiferencias } from './TablaDiferencias'

// Estado de la declaración de un ejercicio cerrado por pasos (#311, #542):
// datos completos (lo calcula la app), revisado, Renta presentada y Modelo
// 721 presentado. Marcar, actualizar o quitar pide confirmación (#497) y
// ofrece Deshacer, que devuelve la marca tal como estaba. Si las cifras han
// cambiado tras revisar o presentar, se ve declarado frente a actual.

type Tipo = Declaracion['tipo']
type Accion = { tipo: Tipo; que: 'marcar' | 'actualizar' | 'quitar' }

const NOMBRE: Record<Tipo, { marcar: string; hecho: string; objeto: string }> = {
  revision: { marcar: 'Marcar como revisado', hecho: 'Revisado', objeto: `la revisión` },
  renta: { marcar: 'Marcar como presentada', hecho: 'Presentada', objeto: 'la Renta' },
  modelo721: { marcar: 'Marcar como presentado', hecho: 'Presentado', objeto: 'el Modelo 721' },
}
const fecha = (d: Declaracion) => formatFiscalDate(d.declaradoEn.slice(0, 10))

function textoConfirmacion(a: Accion, year: number): { title: string; message: string; confirmLabel: string } {
  const n = NOMBRE[a.tipo]
  if (a.que === 'quitar') return {
    title: `Quitar la marca de ${n.objeto} de ${year}`, confirmLabel: 'Quitar la marca',
    message: `Se quitará la marca y sus cifras guardadas. Podrás deshacerlo justo después.`,
  }
  if (a.que === 'actualizar') return {
    title: `Actualizar ${n.objeto} de ${year}`, confirmLabel: 'Guardar las cifras actuales',
    message: 'Las cifras actuales sustituirán a las guardadas (por ejemplo, tras presentar una complementaria). Podrás deshacerlo justo después.',
  }
  return {
    title: `${n.marcar}: ${year}`, confirmLabel: n.marcar,
    message: a.tipo === 'modelo721'
      ? 'Se guardará el valor en custodia de terceros a 31 de diciembre. Para indicar otro valor, márcalo desde Modelo 721.'
      : 'Se guardarán las cifras de este momento para avisarte si cambian después.',
  }
}

export function EstadoDeclaracion({ year, declaraciones, datos, obligado721, onVerRevisar, onModelo721 }: {
  year: number
  declaraciones: readonly Declaracion[]
  datos: DatosEjercicio
  obligado721: boolean | null
  /** Abre Operaciones con las de clave por revisar. */
  onVerRevisar: () => void
  /** Abre la vista Modelo 721. */
  onModelo721: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [accion, setAccion] = useState<Accion | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pasos = pasosEjercicio(year, declaraciones, datos, obligado721)
  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['fiscal-declaraciones'] }),
    qc.invalidateQueries({ queryKey: ['fiscal-calendario'] }),
  ])

  const marcar = (tipo: Tipo) => tipo === 'revision' ? portfolioApi.marcarRevision(year)
    : tipo === 'renta' ? portfolioApi.marcarRenta(year) : portfolioApi.marcar721(year)

  async function ejecutar(a: Accion) {
    setAccion(null)
    setOcupado(true)
    const previa = declaraciones.find(d => d.ejercicio === year && d.tipo === a.tipo)
    try {
      // Deshacer devuelve el estado anterior tal cual: la marca previa con su fecha, o ninguna.
      let deshacer: () => Promise<unknown>
      if (a.que === 'quitar') {
        const { previa: quitada } = await portfolioApi.quitarDeclaracion(year, a.tipo)
        deshacer = () => portfolioApi.restaurarDeclaracion(quitada)
      } else {
        await marcar(a.tipo)
        deshacer = previa ? () => portfolioApi.restaurarDeclaracion(previa) : () => portfolioApi.quitarDeclaracion(year, a.tipo)
      }
      await refrescar()
      const n = NOMBRE[a.tipo]
      toast.addToast({
        type: 'success',
        title: a.que === 'quitar' ? `Marca de ${n.objeto} de ${year} quitada` : a.que === 'actualizar' ? `${n.objeto[0].toUpperCase()}${n.objeto.slice(1)} de ${year} actualizada` : `${n.hecho}: ${year}`,
        action: {
          label: 'Deshacer',
          onClick: () => { void deshacer().then(refrescar).catch(e => toast.fail('No se pudo deshacer', e)) },
        },
      })
    } catch (e) {
      toast.fail(a.que === 'quitar' ? 'No se pudo quitar la marca' : 'No se pudo guardar la marca', e)
    } finally {
      setOcupado(false)
    }
  }

  const btn = (a: Accion, label: string, variante: 'primary' | 'secondary' | 'ghost' = 'secondary') => (
    <button type="button" onClick={() => setAccion(a)} disabled={ocupado} className={buttonClasses(variante, 'sm')}>{label}</button>
  )

  const accionesMarca = (p: Paso) => {
    const tipo = p.id as Tipo
    if (p.estado === 'pendiente') return btn({ tipo, que: 'marcar' }, NOMBRE[tipo].marcar, 'primary')
    if (p.estado === 'no-aplica' || !p.marca) return undefined
    return <>
      {p.estado === 'cambiado' && (
        <Hint label="Guarda las cifras actuales como las declaradas (p. ej. tras presentar una complementaria)">
          {btn({ tipo, que: 'actualizar' }, 'Actualizar')}
        </Hint>
      )}
      {btn({ tipo, que: 'quitar' }, 'Quitar marca', 'ghost')}
    </>
  }

  const detalle = (p: Paso) => {
    if (p.id === 'datos') {
      if (p.estado === 'hecho') return 'Sin operaciones por revisar ni precios pendientes a 31 de diciembre.'
      return (
        <ul className="space-y-1">
          {datos.porRevisar > 0 && (
            <li>
              <button type="button" onClick={onVerRevisar} className="text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                {formatNumber(datos.porRevisar, 0)} {datos.porRevisar === 1 ? 'operación con la clave por revisar' : 'operaciones con la clave por revisar'}
              </button>
            </li>
          )}
          {datos.preciosPendientes.length > 0 && <li>Sin precio a 31 de diciembre: <span className="mono">{datos.preciosPendientes.join(', ')}</span></li>}
        </ul>
      )
    }
    if (p.estado === 'no-aplica') return (
      <>Lo que tenías en custodia de terceros a 31 de diciembre no supera el umbral: este año no hay que presentarlo.{' '}
        <button type="button" onClick={onModelo721} className="text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">Ver Modelo 721</button>
      </>
    )
    if (!p.marca) {
      return p.id === 'revision' ? 'Cuando hayas comprobado las operaciones del ejercicio.'
        : p.id === 'renta' ? 'Cuando hayas presentado la declaración en la AEAT.'
        : 'Si estás obligado: valor en custodia de terceros a 31 de diciembre.'
    }
    const cuando = `${NOMBRE[p.id as Tipo].hecho} el ${fecha(p.marca)}`
    if (p.id === 'modelo721') return <>{cuando} · <span className="mono">{formatEur(Number(p.marca.cifras.valor ?? 0))}</span></>
    return p.estado === 'cambiado' ? <>{cuando}. <span className="font-medium text-warning-ink">Las cifras han cambiado desde entonces.</span></> : <>{cuando}. Las cifras coinciden.</>
  }

  // Tabla de diferencias: la de la Renta si cambió; si no, la de la revisión.
  const conCambios = pasos.find(p => p.id === 'renta' && p.estado === 'cambiado') ?? pasos.find(p => p.id === 'revision' && p.estado === 'cambiado')
  const confirmacion = accion && textoConfirmacion(accion, year)
  const progreso = progresoPasos(pasos)
  // El primer paso pendiente es el siguiente que hay que dar.
  const actual = pasos.find(p => p.estado === 'pendiente')?.id
  const conector = (i: number): Conector => {
    if (i === pasos.length - 1) return null
    if (pasos[i + 1].estado === 'no-aplica') return 'punteado'
    return pasos[i].estado === 'hecho' || pasos[i].estado === 'cambiado' ? 'lleno' : 'vacio'
  }

  return (
    <FiscalChartCard icon={ListChecks} title={`Estado de la declaración ${year}`}
      right={
        <div className="flex items-center gap-3 text-xs">
          <span className={progreso.completo ? 'font-semibold text-positive-ink' : 'text-fg-muted'}>
            {progreso.completo ? 'Ejercicio completo' : `${progreso.hechos} de ${progreso.total} pasos`}
          </span>
          <span className="h-1.5 w-32 rounded-full bg-overlay/10 overflow-hidden" role="progressbar" aria-label={`Pasos hechos de la declaración de ${year}`}
            aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hechos} aria-valuetext={`${progreso.hechos} de ${progreso.total} pasos`}>
            <span className="block h-full rounded-full bg-positive transition-[width]" style={{ width: `${(progreso.hechos / Math.max(1, progreso.total)) * 100}%` }} />
          </span>
        </div>
      }>
      <ol className="grid gap-x-6 gap-y-6 sm:grid-cols-2 xl:grid-cols-4" aria-label={`Pasos de la declaración de ${year}`}>
        {pasos.map((p, i) => (
          <PasoDeclaracion key={p.id} n={i + 1} paso={p} actual={p.id === actual} conector={conector(i)}
            detalle={detalle(p)} acciones={p.id === 'datos' ? undefined : accionesMarca(p)} />
        ))}
      </ol>
      {conCambios?.marca && (
        <div className="mt-4 space-y-2">
          <TablaDiferencias marca={conCambios.marca}
            titulo={`${conCambios.id === 'renta' ? 'Declarado' : 'Revisado'} el ${fecha(conCambios.marca)} frente a las cifras actuales`} />
          <p className="text-xs text-fg-subtle">
            Las cifras pueden cambiar tras una importación, el FIFO global o un cambio de zona horaria. Si los datos nuevos son correctos,
            puede que necesites presentar una declaración complementaria; consúltalo con tu asesor.
          </p>
        </div>
      )}
      {confirmacion && accion && (
        <ConfirmDialog {...confirmacion} danger={accion.que === 'quitar'} onConfirm={() => void ejecutar(accion)} onCancel={() => setAccion(null)} />
      )}
    </FiscalChartCard>
  )
}
