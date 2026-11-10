import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Bell } from 'lucide-react'
import type { FiscalCalendar, FiscalHito } from '../../api/portfolio'
import { formatEur } from '../../utils/format'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { franjaPlazo, mesesCiclo, plazosDelMes, urgencia } from '../../utils/cicloFiscal'
import { buttonClasses, panelSurface } from '../../components/ui'
import { useBellStore } from '../../store/bellStore'
import { AnilloPlazo } from './calendario/AnilloPlazo'
import { TONO_URGENCIA } from './calendario/tonoUrgencia'
import { AnadirCalendario } from './calendario/AnadirCalendario'

// Línea del ciclo fiscal (#309, #538), siempre visible: el próximo plazo con
// su anillo de días y la urgencia en texto; 18 meses en teselas con una franja
// por plazo (cierre, Modelo 721 y Renta) y, debajo, el detalle del mes
// elegido. Las teselas se recorren con las flechas, Inicio y Fin. Fechas y
// estado vienen del backend, igual que en el Dashboard y la campana.

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ACCION: Record<FiscalHito['id'], string> = { cierre: 'Planificar', modelo721: 'Ver Modelo 721', renta: 'Ver el ejercicio' }
const CARRILES: readonly FiscalHito['id'][] = ['cierre', 'modelo721', 'renta']
const FRANJA: Record<FiscalHito['id'], string> = {
  cierre: 'bg-brand/15 text-brand-ink border-brand/35',
  modelo721: 'bg-info/15 text-info-ink border-info/35',
  renta: 'bg-positive/12 text-positive-ink border-positive/35',
}
const ESTADO: Record<FiscalHito['estado'], string> = { 'en-curso': 'Abierto', proximo: 'Próximo', pasado: 'Cerrado' }
const sinObligacion = (h: FiscalHito) => h.id === 'modelo721' && h.obligado === false
// En una franja de un solo mes no cabe el ejercicio: basta el nombre del plazo.
const nombreCorto = (h: FiscalHito, meses: number) => meses === 1
  ? (h.id === 'cierre' ? 'Cierre' : h.id === 'modelo721' ? '721' : 'Renta')
  : (h.id === 'cierre' ? `Cierre ${h.ejercicio}` : h.id === 'modelo721' ? `721 de ${h.ejercicio}` : `Renta de ${h.ejercicio}`)
const mismo = (a: FiscalHito, b: FiscalHito) => a.id === b.id && a.ejercicio === b.ejercicio

function Detalle({ h, neto, enCurso }: { h: FiscalHito; neto: number | undefined; enCurso: boolean }) {
  if (h.id === 'modelo721') {
    return h.obligado === true ? <span className="text-negative-ink">Obligado a presentarlo</span>
      : h.obligado === false ? <span className="text-positive-ink">Sin obligación</span>
      : <span className="text-warning-ink">Obligación por confirmar</span>
  }
  // Si el ejercicio aún no ha terminado, el neto es provisional.
  if (h.id === 'renta') return neto === undefined ? null : <>{enCurso ? 'Neto hasta hoy' : 'A declarar'}: <span className="mono">{`${neto >= 0 ? '+' : ''}${formatEur(neto)}`}</span></>
  return <>Realiza ganancias o pérdidas antes del 31 de diciembre</>
}

function Urgencia({ h }: { h: FiscalHito }) {
  const u = urgencia(h)
  return (
    <span className={`inline-flex items-center gap-1.5 ${TONO_URGENCIA[u.nivel].texto}`}>
      {u.etiqueta && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONO_URGENCIA[u.nivel].chip}`}>{u.etiqueta}</span>}
      <span className="font-medium">{u.texto}</span>
    </span>
  )
}

export function CalendarioFiscal({ data, netoPorAnio, onGo }: {
  data: FiscalCalendar
  netoPorAnio: ReadonlyMap<number, number>
  onGo: (h: FiscalHito) => void
}) {
  const uid = useId()
  const p = data.proximo
  const meses = mesesCiclo(data.ventana)
  const mesHoy = data.hoy.slice(0, 7)
  const [elegido, setElegido] = useState(mesHoy)
  const activo = meses.some(m => m.clave === elegido) ? elegido : meses[0]?.clave
  const teselas = useRef<Array<HTMLButtonElement | null>>([])
  const abrirCampana = useBellStore(s => s.setOpen)
  const anioHoy = Number(data.hoy.slice(0, 4))

  // Patrón de pestañas con activación automática: las flechas mueven el foco y eligen el mes.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = meses.findIndex(m => m.clave === activo)
    const destino = e.key === 'ArrowRight' ? Math.min(meses.length - 1, i + 1) : e.key === 'ArrowLeft' ? Math.max(0, i - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? meses.length - 1 : null
    if (destino === null) return
    e.preventDefault()
    setElegido(meses[destino].clave)
    teselas.current[destino]?.focus()
  }

  const delMes = activo ? plazosDelMes(data.ciclo, activo) : []
  const mesActivo = meses.find(m => m.clave === activo)
  // Los 18 meses caben a lo ancho; por debajo de 3 rem por mes, la fila se desplaza en horizontal.
  const columnas = { gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))`, minWidth: `calc(${meses.length} * 3rem + ${meses.length - 1} * 0.25rem)` }

  return (
    <section aria-labelledby={`${uid}-titulo`} className={panelSurface('none', 'p-5 space-y-5')}>
      {/* Próximo plazo: anillo, urgencia en texto y acciones */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <AnilloPlazo hito={p} />
        <div className="flex-1 min-w-[16rem] space-y-1">
          <h2 id={`${uid}-titulo`} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Próximo plazo fiscal</h2>
          <p className="text-lg font-semibold text-fg">{p.titulo}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            <Urgencia h={p} />
            <span className="text-fg-subtle">· hasta el {formatFiscalDate(p.hasta)}</span>
          </p>
          <p className="text-xs text-fg-muted"><Detalle h={p} neto={netoPorAnio.get(p.ejercicio)} enCurso={p.ejercicio === anioHoy} /></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onGo(p)} className={buttonClasses('primary', 'sm')}>{ACCION[p.id]}</button>
          <button type="button" onClick={() => abrirCampana(true)} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
            <Bell size={13} aria-hidden="true" /> Ver avisos
          </button>
          <AnadirCalendario ciclo={data.ciclo} />
        </div>
      </div>

      {/* 18 meses: teselas navegables y una franja por plazo */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="grid gap-x-1 gap-y-1.5" style={columnas}>
          <div role="tablist" aria-label="Meses del ciclo fiscal" onKeyDown={onKeyDown} className="contents">
            {meses.map((m, i) => {
              const sel = m.clave === activo
              const hoy = m.clave === mesHoy
              const n = plazosDelMes(data.ciclo, m.clave).length
              return (
                <button key={m.clave} ref={el => { teselas.current[i] = el }} type="button" role="tab" id={`${uid}-mes-${m.clave}`}
                  aria-selected={sel} aria-controls={`${uid}-detalle`} tabIndex={sel ? 0 : -1}
                  aria-label={`${MESES_LARGOS[Number(m.clave.slice(5)) - 1]} de ${m.anio}${hoy ? ', mes actual' : ''}: ${n === 0 ? 'sin plazos' : n === 1 ? '1 plazo' : `${n} plazos`}`}
                  onClick={() => setElegido(m.clave)}
                  className={`relative flex flex-col items-center justify-end h-14 rounded-lg border text-xs transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
                    sel ? 'border-brand/60 bg-brand/12 text-fg' : 'border-border bg-overlay/[0.03] text-fg-muted hover:bg-overlay/[0.07] hover:text-fg'}`}>
                  {m.rotulaAnio && <span className="absolute top-1 text-[10px] mono text-fg-subtle">{m.anio}</span>}
                  <span className={`pb-1.5 capitalize ${sel ? 'font-semibold' : ''}`}>{m.etiqueta}</span>
                  {hoy && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full bg-brand" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          {CARRILES.map(carril => data.ciclo.filter(h => h.id === carril).map(h => {
            // El cierre se marca solo en diciembre, su último día; el resto ocupa su plazo.
            const f = h.id === 'cierre' ? franjaPlazo({ desde: h.hasta, hasta: h.hasta }, meses) : franjaPlazo(h, meses)
            if (!f) return null
            const fila = CARRILES.indexOf(carril) + 2
            return (
              <div key={`${h.id}-${h.ejercicio}`} aria-hidden="true" style={{ gridColumn: `${f.inicio + 1} / span ${f.meses}`, gridRow: fila }}
                className={`flex items-center gap-1.5 h-7 rounded-md border px-2 text-[11px] font-medium whitespace-nowrap overflow-hidden ${
                  sinObligacion(h) ? 'border-dashed border-fg-subtle/50 text-fg-subtle' : FRANJA[h.id]} ${h.estado === 'pasado' ? 'opacity-60' : ''} ${mismo(h, p) ? 'ring-1 ring-offset-1 ring-offset-background-card ring-current' : ''}`}>
                <span className="truncate">{nombreCorto(h, f.meses)}{sinObligacion(h) && f.meses > 1 ? ' · sin obligación' : ''}</span>
              </div>
            )
          }))}
        </div>
      </div>

      {/* Detalle del mes elegido */}
      <div role="tabpanel" id={`${uid}-detalle`} aria-labelledby={activo ? `${uid}-mes-${activo}` : undefined} className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-fg first-letter:uppercase">
          {mesActivo ? `${MESES_LARGOS[Number(mesActivo.clave.slice(5)) - 1]} de ${mesActivo.anio}` : ''}
        </h3>
        {delMes.length === 0 ? (
          <p className="mt-2 text-sm text-fg-subtle">Sin plazos fiscales este mes.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {delMes.map(h => (
              <li key={`${h.id}-${h.ejercicio}`} className={`rounded-xl border p-3.5 space-y-1.5 text-xs ${mismo(h, p) ? 'border-brand/40 bg-brand/5' : 'border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{h.titulo}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${h.presentado ? 'bg-positive/12 text-positive-ink' : h.estado === 'en-curso' ? 'bg-positive/12 text-positive-ink' : 'bg-overlay/10 text-fg-muted'}`}>
                    {h.presentado ? 'Presentado' : ESTADO[h.estado]}
                  </span>
                </div>
                <p className="text-fg-muted">
                  {h.inicioAproximado ? `Hacia el ${formatFiscalDate(h.desde)}` : `Del ${formatFiscalDate(h.desde)}`} al {formatFiscalDate(h.hasta)}
                </p>
                {/* Lo ya presentado no tiene cuenta atrás (#542). */}
                <p className="text-sm">{h.presentado ? <span className="font-medium text-positive-ink">Ya presentado</span> : <Urgencia h={h} />}</p>
                <p className="text-fg-muted"><Detalle h={h} neto={netoPorAnio.get(h.ejercicio)} enCurso={h.ejercicio === anioHoy} /></p>
                <button type="button" onClick={() => onGo(h)}
                  className="text-brand-ink font-medium hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">{ACCION[h.id]}</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-fg-subtle">Fechas habituales: la AEAT publica cada año el calendario oficial.</p>
      </div>
    </section>
  )
}
