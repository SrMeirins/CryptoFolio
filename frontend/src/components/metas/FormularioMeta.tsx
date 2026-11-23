import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { CheckCircle2, Coins, Landmark, Target, Wallet, type LucideIcon } from 'lucide-react'
import { Button, Dropdown, Field, Input } from '../ui'
import { AnilloMeta } from './AnilloMeta'
import { parseNumeroLocal } from '../../utils/numeroLocal'
import { formatAmount, formatMoney, type Currency } from '../../utils/format'
import { COLOR_META, MAX_NOMBRE_META, nuevoIdMeta, TIPO_META_TEXTO, type Meta, type ProgresoMeta, type TipoMeta } from '../../utils/metas'

// Formulario de una meta de inversión (#520), para crearla o editarla, con el
// estilo de las tarjetas de métricas: el tipo se elige en teselas del color de
// cada uno (radios nativos, con flechas del teclado), el nombre, el activo en
// las de cantidad y el objetivo con su unidad. Con `vista`, una vista previa
// del anillo con el progreso en vivo mientras se escribe. Las de importe
// guardan la moneda de visualización con la que se crean; al editar conservan
// la suya. Común a la franja del Dashboard y a Ajustes › General.

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumSignificantDigits: 12, useGrouping: false })
const TIPOS: ReadonlyArray<{ tipo: TipoMeta; icono: LucideIcon; detalle: string }> = [
  { tipo: 'valor', icono: Wallet, detalle: 'Cripto y efectivo a precio de mercado.' },
  { tipo: 'aportado', icono: Landmark, detalle: 'Depositado menos retirado desde el 1 de enero.' },
  { tipo: 'cantidad', icono: Coins, detalle: 'Unidades de un activo en todas las wallets.' },
]

export function FormularioMeta({ inicial, currency, activos, vista, onGuardar, onCancelar, guardando = false, error = null }: {
  /** Meta que se edita; sin ella, se crea una nueva. */
  inicial?: Meta
  /** Moneda de visualización: la de una meta de importe nueva. */
  currency: Currency
  /** Activos de la cartera que se pueden elegir en una meta de cantidad. */
  activos: readonly string[]
  /** Progreso en vivo de la meta que se está escribiendo, para la vista previa. */
  vista?: (meta: Meta) => ProgresoMeta | null
  onGuardar: (meta: Meta) => void
  onCancelar: () => void
  guardando?: boolean
  /** Error del servidor al guardar. */
  error?: string | null
}) {
  const id = useId()
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoMeta>(inicial?.tipo ?? 'valor')
  const [objetivo, setObjetivo] = useState(inicial ? fmt(inicial.objetivo) : '')
  const opcionesActivo = inicial?.tipo === 'cantidad' && !activos.includes(inicial.activo) ? [inicial.activo, ...activos] : activos
  const [activo, setActivo] = useState(inicial?.tipo === 'cantidad' ? inicial.activo : opcionesActivo[0] ?? '')
  const [tocado, setTocado] = useState(false)

  const moneda = inicial && inicial.tipo !== 'cantidad' ? inicial.moneda : currency
  const valor = parseNumeroLocal(objetivo)
  const nombreLimpio = nombre.trim()
  const errores = {
    nombre: nombreLimpio.length === 0 ? 'Escribe un nombre para la meta.' : null,
    objetivo: valor === null || !(valor > 0) ? 'Escribe un objetivo mayor que 0, por ejemplo 10.000.' : null,
    activo: tipo === 'cantidad' && !activo ? 'No hay activos en la cartera para elegir.' : null,
  }
  const invalido = Object.values(errores).some(Boolean)
  const unidad = tipo === 'cantidad' ? activo || 'unidades' : moneda === 'EUR' ? '€' : '$'
  const color = COLOR_META[tipo]

  const construir = (n: string, v: number): Meta => {
    const base = { id: inicial?.id ?? 'vista-previa', nombre: n, objetivo: v }
    return tipo === 'cantidad' ? { ...base, tipo, activo } : { ...base, tipo, moneda }
  }
  const previa = vista && !errores.objetivo && !errores.activo ? vista(construir(nombreLimpio || 'Nueva meta', valor!)) : null
  const cifra = (n: number) => (previa?.moneda ? formatMoney(n, previa.moneda) : `${formatAmount(n)} ${tipo === 'cantidad' ? activo : ''}`.trim())

  function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (invalido) return
    onGuardar({ ...construir(nombreLimpio, valor!), id: inicial?.id ?? nuevoIdMeta() })
  }

  const err = (k: keyof typeof errores) => (tocado ? errores[k] ?? undefined : undefined)
  return (
    <form onSubmit={enviar} aria-label={inicial ? `Editar la meta ${inicial.nombre}` : 'Nueva meta'} noValidate
      className="stat-card relative rounded-2xl p-px" style={{ '--card': color } as CSSProperties}>
      <div className="stat-card-body rounded-[15px] p-4 sm:p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="size-8 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
            <Target size={16} style={{ color }} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{inicial ? 'Editar meta' : 'Nueva meta'}</p>
            <p className="text-xs text-fg-subtle">El progreso se calcula en vivo con los precios.</p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-fg-muted">Tipo de meta</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS.map(({ tipo: t, icono: Icono, detalle }) => {
              const elegido = t === tipo
              const c = COLOR_META[t]
              return (
                <label key={t} className="relative flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors hover:bg-overlay/4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
                  style={{ borderColor: elegido ? c : 'var(--cf-border)', backgroundColor: elegido ? `color-mix(in srgb, ${c} 9%, transparent)` : undefined }}>
                  <input type="radio" name={`${id}-tipo`} value={t} checked={elegido} onChange={() => setTipo(t)}
                    aria-label={TIPO_META_TEXTO[t]} aria-describedby={`${id}-${t}`} className="sr-only" />
                  <span className="size-8 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true"
                    style={{ backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)` }}>
                    <Icono size={15} style={{ color: c }} />
                  </span>
                  <span className="min-w-0 pr-4">
                    <span className="block text-sm font-medium text-fg">{TIPO_META_TEXTO[t]}</span>
                    <span id={`${id}-${t}`} className="block text-[11px] leading-snug text-fg-subtle mt-0.5">{detalle}</span>
                  </span>
                  {elegido && <CheckCircle2 size={15} aria-hidden="true" className="absolute top-2.5 right-2.5" style={{ color: c }} />}
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className={`grid gap-4 ${vista ? 'md:grid-cols-[minmax(0,1fr)_15rem]' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 content-start">
            <Field label="Nombre" error={err('nombre')} className="sm:col-span-2">
              {ctrl => <Input {...ctrl} value={nombre} maxLength={MAX_NOMBRE_META} onChange={e => setNombre(e.target.value)} placeholder="Por ejemplo, Primeros 10.000" />}
            </Field>
            {tipo === 'cantidad' && (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-fg-muted">Activo</span>
                <Dropdown label="Activo de la meta" value={activo} onChange={setActivo} placeholder="Sin activos" className="w-full"
                  options={opcionesActivo.map(a => ({ value: a, label: a }))} />
                {err('activo') && <p role="alert" className="text-xs text-negative-ink">{errores.activo}</p>}
              </div>
            )}
            <Field label={`Objetivo (${unidad})`} error={err('objetivo')} className={tipo === 'cantidad' ? '' : 'sm:col-span-2'}>
              {ctrl => (
                <div className="relative">
                  <Input {...ctrl} inputMode="decimal" value={objetivo} onChange={e => setObjetivo(e.target.value)} onBlur={() => setTocado(true)}
                    placeholder="10.000" className="mono pr-14" />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-subtle">{unidad}</span>
                </div>
              )}
            </Field>
          </div>

          {vista && (
            <div className="rounded-xl border border-border bg-overlay/3 p-3 flex items-center gap-3 min-w-0" data-testid="vista-previa-meta">
              <AnilloMeta progreso={previa} nombre="la vista previa" color={previa?.cumplida ? 'var(--cf-positive)' : color} tam="sm" />
              <div className="min-w-0 text-xs">
                <p className="text-[11px] uppercase tracking-widest text-fg-subtle">Vista previa</p>
                {previa ? (
                  <>
                    <p className="mt-1 text-fg-muted truncate">Ahora <span className="mono text-fg">{cifra(previa.actual)}</span></p>
                    <p className="text-fg-muted truncate">{previa.cumplida ? 'Ya está cumplida' : <>Faltan <span className="mono text-fg">{cifra(previa.faltan)}</span></>}</p>
                  </>
                ) : <p className="mt-1 text-fg-subtle">Escribe un objetivo para ver el progreso.</p>}
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={guardando}>Guardar meta</Button>
        </div>
      </div>
    </form>
  )
}
