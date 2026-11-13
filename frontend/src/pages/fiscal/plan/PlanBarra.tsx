import { useId, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ClipboardCopy, ListChecks, ListPlus, Trash2 } from 'lucide-react'
import type { AvisoPlan, VentaPlanGuardada } from '../../../api/portfolio'
import { buttonClasses, fieldClasses, iconButtonClasses, QueryError } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { formatEur, formatEurSigned, formatNumber } from '../../../utils/format'
import { formatFiscalDate } from '../../../utils/fiscalTable'
import { cantidadEnCampo, parseCantidad, precioDe, textoPlan } from '../../../utils/planVentas'
import { today } from '../../../utils/date'
import type { usePlan } from './usePlan'

// Barra fija del plan de ventas (#546): siempre a la vista al pie de
// Planificar, con el efecto conjunto (ganancia, pérdida y cuota antes y
// después); se despliega para editar las ventas (cantidad y precio propio),
// la comisión estimada, ver los avisos, copiar y vaciar. Supr quita la venta
// enfocada; P abre o cierra el plan (el atajo lo gestiona Planificar).

type Plan = ReturnType<typeof usePlan>

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

function textoAviso(a: AvisoPlan, nombreWallet: (id: string) => string): string {
  if (a.tipo === 'colchon') return `El plan pasa del colchón en ${formatEur(a.exceso)}: añade ${formatEur(a.cuotaExtra)} de cuota.`
  if (a.tipo === 'recompra') {
    return `Vendes ${a.asset} con pérdida y lo compraste hace menos de 2 meses (${a.compras.map(formatFiscalDate).join(', ')}): la pérdida no computará hasta que vendas esa compra. Tampoco lo recompres en los 2 meses siguientes.`
  }
  return `Pides ${formatNumber(a.pedido, 8)} ${a.asset} de ${nombreWallet(a.walletId)}, pero hay ${formatNumber(a.disponible, 8)}: solo se cuenta lo que hay.`
}

/** Campo numérico que confirma al salir o con Intro; con `cero`, admite 0 (la comisión). */
function CampoNumero({ valor, label, placeholder, cero = false, onCambio }: {
  valor: number | null; label: string; placeholder?: string; cero?: boolean; onCambio: (n: number | null) => void
}) {
  const [txt, setTxt] = useState(valor === null ? '' : cantidadEnCampo(valor))
  const n = txt.trim() ? parseCantidad(txt) : null
  const valido = n === null || (Number.isFinite(n) && (cero ? n >= 0 : n > 0))
  return (
    <input type="text" inputMode="decimal" value={txt} aria-label={label} placeholder={placeholder} aria-invalid={!valido} maxLength={24}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { if (valido && n !== valor) onCambio(n) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={fieldClasses('sm', !valido, 'w-28 mono text-right')} />
  )
}

export function PlanBarra({ plan, prices, abierto, setAbierto, onVentaLibre }: {
  plan: Plan
  prices: Readonly<Record<string, number>>
  abierto: boolean
  setAbierto: (v: boolean) => void
  onVentaLibre: () => void
}) {
  const uid = useId()
  const toast = useToast()
  const { ventas, efecto, comisionPct } = plan
  const nombreWallet = (id: string) => ventas.find(v => v.walletId === id)?.walletNombre ?? 'la wallet'

  function quitar(i: number) {
    const previas = ventas
    plan.cambiar(ventas.filter((_, j) => j !== i))
    toast.addToast({ type: 'info', title: 'Venta quitada del plan', message: `${previas[i].asset} de ${previas[i].walletNombre}`,
      action: { label: 'Deshacer', onClick: () => plan.cambiar(previas) } })
  }
  function vaciar() {
    const previas = ventas
    plan.cambiar([])
    toast.addToast({ type: 'info', title: 'Plan vaciado', action: { label: 'Deshacer', onClick: () => plan.cambiar(previas) } })
  }
  function editar(i: number, cambio: Partial<VentaPlanGuardada>) {
    plan.cambiar(ventas.map((v, j) => (j === i ? { ...v, ...cambio } : v)))
  }
  async function copiar() {
    const texto = textoPlan({ ejercicio: plan.planQ.data?.ejercicio ?? new Date().getFullYear(), fecha: formatFiscalDate(today()), ventas, prices, efecto, comisionPct })
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Plan copiado', 'Pégalo en tus notas o en un mensaje.')
    } catch (e) {
      toast.fail('No se pudo copiar el plan', e)
    }
  }
  function teclaFila(e: KeyboardEvent<HTMLTableRowElement>, i: number) {
    if (e.key === 'Delete' && e.target === e.currentTarget) { e.preventDefault(); quitar(i) }
  }

  const diferencia = efecto ? efecto.cuotaDespues - efecto.cuotaAntes : 0
  return (
    <section aria-label="Tu plan de ventas" className="sticky bottom-0 z-20 -mx-1 rounded-t-2xl border border-border bg-background-card/95 backdrop-blur shadow-lg">
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          <ListChecks size={15} aria-hidden="true" className="text-brand" />
          Tu plan{ventas.length > 0 ? `: ${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}` : ''}
        </span>
        {ventas.length === 0 ? (
          <span className="text-xs text-fg-subtle">Vacío: añade sugerencias con «Añadir al plan» o una venta cualquiera con «Añadir otra venta».</span>
        ) : (
          <dl className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs" aria-live="polite">
            {plan.esperandoPrecios && <div><dt className="sr-only">Estado</dt><dd className="text-fg-subtle">Esperando precios en vivo</dd></div>}
            {efecto && <>
              <div className="flex gap-1"><dt className="text-fg-subtle">Ganancia</dt><dd className="mono text-positive">{formatEur(efecto.ganancia)}</dd></div>
              <div className="flex gap-1"><dt className="text-fg-subtle">Pérdida</dt><dd className="mono text-negative">{formatEur(Math.abs(efecto.perdida))}</dd></div>
              <div className="flex gap-1"><dt className="text-fg-subtle">Cuota</dt>
                <dd className="mono text-fg">de {formatEur(efecto.cuotaAntes)} a {formatEur(efecto.cuotaDespues)} <span className={diferencia > 0.005 ? 'text-negative' : diferencia < -0.005 ? 'text-positive' : 'text-fg-subtle'}>({formatEurSigned(diferencia)})</span></dd></div>
              {efecto.avisos.length > 0 && (
                <div className="flex gap-1 text-warning-ink"><dt className="sr-only">Avisos</dt>
                  <dd className="inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden="true" />{efecto.avisos.length} {efecto.avisos.length === 1 ? 'aviso' : 'avisos'}</dd></div>
              )}
            </>}
          </dl>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onVentaLibre} className={buttonClasses('ghost', 'sm', 'flex gap-1')}><ListPlus size={12} aria-hidden="true" /> Añadir otra venta</button>
          {ventas.length > 0 && <>
            <button type="button" onClick={() => void copiar()} className={buttonClasses('ghost', 'sm', 'flex gap-1')}><ClipboardCopy size={12} aria-hidden="true" /> Copiar</button>
            <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-controls={`${uid}-plan`} className={buttonClasses('secondary', 'sm')}>
              {abierto ? 'Ocultar plan' : 'Ver plan'}
            </button>
          </>}
        </span>
      </div>

      {plan.planQ.isError && <QueryError what="tu plan guardado" error={plan.planQ.error} onRetry={() => void plan.planQ.refetch()} className="mx-4 mb-3" />}
      {plan.errorGuardar !== null && <p role="alert" className="px-4 pb-2 text-xs text-negative-ink">No se pudo guardar el último cambio del plan. Vuelve a intentarlo.</p>}

      {abierto && ventas.length > 0 && (
        <div id={`${uid}-plan`} className="border-t border-border px-4 py-3 space-y-3 max-h-[55vh] overflow-y-auto">
          {plan.efectoQ.isError && <QueryError what="el efecto del plan" error={plan.efectoQ.error} onRetry={() => void plan.efectoQ.refetch()} />}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Ventas del plan; Supr quita la fila enfocada</caption>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-fg-subtle">
                  <th scope="col" className="text-left font-medium py-1.5 pr-3">Venta</th>
                  <th scope="col" className="text-right font-medium py-1.5 pr-3">Cantidad</th>
                  <th scope="col" className="text-right font-medium py-1.5 pr-3">Precio</th>
                  <th scope="col" className="text-right font-medium py-1.5 pr-3">Resultado</th>
                  <th scope="col" className="py-1.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {ventas.map((v, i) => {
                  const r = efecto?.ventas[i]
                  const vivo = precioDe({ ...v, precioEur: null }, prices)
                  return (
                    <tr key={`${v.asset}-${v.walletId}-${i}`} tabIndex={0} onKeyDown={e => teclaFila(e, i)} aria-label={`${v.asset} de ${v.walletNombre}`} className={`${FOCO} rounded`}>
                      <th scope="row" className="text-left font-normal py-1.5 pr-3">
                        <span className="mono font-semibold text-fg">{v.asset}</span> <span className="text-fg-subtle">de {v.walletNombre}</span>
                      </th>
                      <td className="text-right py-1.5 pr-3">
                        <CampoNumero key={`c${v.cantidad}`} valor={v.cantidad} label={`Cantidad de ${v.asset} de ${v.walletNombre}`} onCambio={n => n !== null && editar(i, { cantidad: n })} />
                        {r && r.cantidadVendida < r.cantidad - 1e-9 && <span className="block text-[10.5px] text-warning-ink">solo hay {formatNumber(r.cantidadVendida, 8)}</span>}
                      </td>
                      <td className="text-right py-1.5 pr-3">
                        <CampoNumero key={`p${v.precioEur}`} valor={v.precioEur} label={`Precio propio de ${v.asset} de ${v.walletNombre}`}
                          placeholder={vivo ? formatEur(vivo) : 'en vivo'} onCambio={n => editar(i, { precioEur: n })} />
                        <span className="block text-[10.5px] text-fg-subtle">{v.precioEur === null ? 'en vivo' : 'precio propio'}</span>
                      </td>
                      <td className={`text-right mono py-1.5 pr-3 ${!r ? 'text-fg-subtle' : r.resultado < 0 ? 'text-negative' : 'text-positive'}`}>
                        {r ? formatEurSigned(r.resultado) : 'calculando'}
                      </td>
                      <td className="text-right py-1.5">
                        <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${v.asset} de ${v.walletNombre} del plan`} className={iconButtonClasses('sm')}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {efecto && efecto.avisos.length > 0 && (
            <ul className="space-y-1 text-xs" aria-label="Avisos del plan">
              {efecto.avisos.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-warning-ink"><AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />{textoAviso(a, nombreWallet)}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 flex-wrap text-xs">
            <label className="flex items-center gap-2">
              <span className="text-fg-muted">Comisión estimada</span>
              <CampoNumero key={`k${comisionPct}`} cero valor={comisionPct} label="Comisión estimada en porcentaje" onCambio={n => plan.cambiarComision(n === null ? 0 : Math.min(n, 10))} />
              <span className="text-fg-muted">%</span>
            </label>
            <span className="text-fg-subtle">
              {plan.calculadoEn ? `Calculado a las ${new Date(plan.calculadoEn).toLocaleTimeString('es-ES')}, con FIFO global; se actualiza cada 30 s.` : ''}
            </span>
            <button type="button" onClick={vaciar} className={buttonClasses('ghost', 'sm', 'ml-auto text-negative-ink')}>Vaciar plan</button>
          </div>
        </div>
      )}
    </section>
  )
}
