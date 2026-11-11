import { Clock } from 'lucide-react'
import { cardClasses, Dropdown, Tooltip } from '../../components/ui'
import { OPCIONES_DESFASE, textoDeteccion, type DeteccionZona } from './zonaHoraria'
import { EsperaConTiempo } from './EsperaConTiempo'

// Zona horaria de los archivos de Binance en la revisión de la importación
// (#599). El CSV no la indica: se detecta con el precio de mercado y se puede
// cambiar; las horas de la vista previa ya están en la zona elegida.

export interface ZonaArchivo {
  indice: number
  nombre: string
  desfase: number
  deteccion?: DeteccionZona
}

export function ZonaHorariaCard({ zonas, comprobando, cambiando, onCambiar }: {
  zonas: ZonaArchivo[]
  comprobando: boolean
  cambiando: boolean
  onCambiar: (indice: number, desfase: number) => void
}) {
  if (zonas.length === 0) return null
  const varios = zonas.length > 1
  return (
    <section aria-labelledby="zona-titulo" className={cardClasses('md', 'space-y-2')}>
      <h2 id="zona-titulo" className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <Clock size={14} aria-hidden="true" className="text-fg-subtle" />
        Zona horaria del CSV de Binance
        <Tooltip label="Zona horaria del CSV">
          <p>El CSV de Binance da la hora sin indicar su zona: depende de la que elegiste al exportarlo. Si se lee mal, cada operación queda desplazada varias horas, y con ellas el precio de mercado y el día de la operación.</p>
          <p className="mt-1.5 text-fg-subtle">Se detecta comparando tus órdenes con el precio negociado en Binance a cada hora posible.</p>
        </Tooltip>
      </h2>
      <ul className="space-y-2">
        {zonas.map(z => (
          <li key={z.indice} className="flex items-center gap-3 flex-wrap">
            <span className="min-w-0 flex-1 text-xs text-fg-muted">
              {varios && <span className="block text-fg truncate">{z.nombre}</span>}
              {comprobando && !z.deteccion
                ? <EsperaConTiempo texto="Comprobando la zona horaria con el precio de mercado…" estimadoSeg={10} />
                : <span role="status">{textoDeteccion(z.deteccion, false)}</span>}
            </span>
            <Dropdown size="sm" label={`Zona horaria de ${z.nombre}`} value={z.desfase} options={OPCIONES_DESFASE}
              onChange={(d: number) => onCambiar(z.indice, d)} disabled={cambiando} align="end" />
          </li>
        ))}
      </ul>
    </section>
  )
}
