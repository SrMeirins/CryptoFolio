import { useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { portfolioApi, type ImportRecord } from '../../api/portfolio'
import { backupApi } from '../../api/backup'
import { buttonClasses, Dropdown, Modal, ModalBody, ModalFooter, ModalHeader, QueryError } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { useRunFifoStream } from '../../hooks/useRunFifoStream'
import { failure } from '../../utils/queryFailure'
import { FifoRunPanel } from '../settings/FifoRunPanel'
import { EsperaConTiempo } from './EsperaConTiempo'
import { etiquetaDesfase, OPCIONES_DESFASE, textoDeteccion, textoImpacto } from './zonaHoraria'

// Corregir la zona horaria de una importación de Binance ya hecha (#599): se
// detecta con el precio de mercado, se ve qué cambia, se guarda una copia
// previa, se desplazan sus transacciones y se recalcula el FIFO. Cada paso se
// ve: comprobando, desplazando, recalculando (con su avance) y el resultado.

type Fase = 'eligiendo' | 'desplazando' | 'recalculando' | 'hecho'

export function CorregirZonaDialog({ imp, onClose }: { imp: ImportRecord; onClose: () => void }) {
  const titleId = useId()
  const queryClient = useQueryClient()
  const toast = useToast()
  const fifo = useRunFifoStream()
  const estadoQ = useQuery({ queryKey: ['zona-horaria', imp.id], queryFn: () => portfolioApi.getZonaHoraria(imp.id) })
  const estado = estadoQ.data
  const actual = estado?.desfaseActual ?? imp.desfase_horas ?? 0
  const [elegido, setElegido] = useState<number | null>(null)
  // Sin elegir: la detectada, si la hay; si no, la actual.
  const desfase = elegido ?? estado?.deteccion.desfaseHoras ?? actual
  const [fase, setFase] = useState<Fase>('eligiendo')
  const [copiaPrevia, setCopiaPrevia] = useState<string | null>(null)
  const impactoQ = useQuery({
    queryKey: ['zona-horaria-impacto', imp.id, desfase],
    queryFn: () => portfolioApi.getImpactoZonaHoraria(imp.id, desfase),
    enabled: !!estado && desfase !== actual && fase === 'eligiendo',
  })
  const fallo = failure(estadoQ, impactoQ)
  const ocupado = fase === 'desplazando' || fase === 'recalculando'

  async function aplicar() {
    setFase('desplazando')
    try {
      const r = await portfolioApi.setZonaHoraria(imp.id, desfase)
      setCopiaPrevia(r.copiaPrevia)
      setFase('recalculando')
      const final = await fifo.run()
      await queryClient.invalidateQueries()
      setFase('hecho')
      if (final.status === 'error') toast.error('Horas corregidas, pero el FIFO no terminó', 'Recalcúlalo en Ajustes, Datos.')
      else toast.success(`Zona horaria de «${imp.filename}»: ${etiquetaDesfase(desfase)}`, 'Horas corregidas y FIFO recalculado.')
    } catch (e) {
      setFase('eligiendo')
      toast.fail('No se pudo corregir la zona horaria', e)
    }
  }

  async function deshacer() {
    if (!copiaPrevia) return
    try {
      await backupApi.revert(copiaPrevia)
      await queryClient.invalidateQueries()
      toast.success('Zona horaria deshecha', 'Se ha vuelto a la copia previa.')
      onClose()
    } catch (e) {
      toast.fail('No se pudo deshacer', e)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} closeOnOverlay={!ocupado}>
      <ModalHeader titleId={titleId} title="Corregir zona horaria" subtitle={imp.filename}
        icon={<Clock size={16} aria-hidden="true" />} onClose={ocupado ? undefined : onClose} />
      <ModalBody className="space-y-3 text-sm">
        {fase === 'eligiendo' && <>
          <p className="text-fg-muted">
            El CSV de Binance da la hora sin su zona. Esta importación se leyó como <strong className="font-medium text-fg">{etiquetaDesfase(actual)}</strong>.
          </p>
          {fallo && <QueryError what="la zona horaria" error={fallo.error} onRetry={fallo.retry} className="rounded-xl border border-border" />}
          {estadoQ.isLoading
            ? <EsperaConTiempo texto="Comprobando la zona horaria con el precio de mercado de 20 órdenes…" estimadoSeg={10} />
            : <p className="text-xs text-fg-muted" role="status">{textoDeteccion(estado?.deteccion, false)}</p>}
          {/* Mientras se comprueba, solo el estado: ni zona elegible ni conclusiones. */}
          {estado && <>
            <Dropdown label="Zona horaria del CSV" value={desfase} options={OPCIONES_DESFASE} onChange={(d: number) => setElegido(d)} />
            {desfase === actual
              ? <p className="text-xs text-fg-subtle">Es la zona con la que ya está importada: no cambia nada.</p>
              : impactoQ.isLoading
                ? <EsperaConTiempo texto="Calculando qué cambia…" />
                : impactoQ.data && <p className="text-xs text-fg-muted" role="status">{textoImpacto(impactoQ.data, desfase - actual)} Antes se guarda una copia previa y después se recalcula el FIFO, que descarga los precios del momento de las horas nuevas (la primera vez, unos minutos).</p>}
          </>}
        </>}

        {fase === 'desplazando' && <EsperaConTiempo texto={`Paso 1 de 2: guardando una copia previa y desplazando las horas a ${etiquetaDesfase(desfase)}…`} estimadoSeg={5} />}

        {fase === 'recalculando' && <>
          <p className="text-xs text-fg-muted">Paso 2 de 2: recalculando el FIFO con los precios del momento de las horas corregidas. Puedes seguir esperando aquí; no cierres la aplicación.</p>
          <FifoRunPanel state={fifo.state} />
        </>}

        {fase === 'hecho' && <>
          <p className="text-fg-muted" role="status">
            Horas corregidas a <strong className="font-medium text-fg">{etiquetaDesfase(desfase)}</strong>. Así ha cambiado el FIFO:
          </p>
          <FifoRunPanel state={fifo.state} />
        </>}
      </ModalBody>
      {!ocupado && <ModalFooter>
        {fase === 'eligiendo' && <>
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
          <button type="button" onClick={() => void aplicar()} disabled={!estado || desfase === actual || !impactoQ.data}
            className={buttonClasses('primary', 'sm')}>
            Aplicar {etiquetaDesfase(desfase)} y recalcular
          </button>
        </>}
        {fase === 'hecho' && <>
          {copiaPrevia && <button type="button" onClick={() => void deshacer()} className={buttonClasses('ghost', 'sm')}>Deshacer</button>}
          <button type="button" onClick={onClose} className={buttonClasses('primary', 'sm')}>Cerrar</button>
        </>}
      </ModalFooter>}
    </Modal>
  )
}
