import { useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft } from 'lucide-react'
import { portfolioApi, type ConversionRestos, type ConversionRestosPreview } from '../../../api/portfolio'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Notice } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { getAppTimezone } from '../../../constants/timezone'
import { formatAmount, formatEur, pnlColor } from '../../../utils/format'
import { formatNumeroLocal, parseNumeroLocal } from '../../../utils/numeroLocal'
import { descuadre, repartirRecibido, type FichaResto } from '../../../utils/saldosResiduales'
import { fromZonedInput, toZonedInput } from '../../../utils/zonedDateTime'
import { ink } from '../../../utils/colors'

// Registrar la conversión de restos (#530): los restos elegidos (de una misma
// wallet) se convierten en otro activo. Se escribe el total recibido, ya neto
// de comisión, y se reparte según el valor de cada resto (editable). La vista
// previa estima el resultado fiscal de cada resto con el FIFO global; al
// confirmar se crea una permuta por resto y el FIFO se recalcula una vez.

const SYMBOL = /^[A-Z0-9]{1,20}$/
const fmt8 = (n: number) => formatNumeroLocal(n, 8)

export function ConversionRestosModal({ fichas, sugerencias, onClose, onDone }: {
  fichas: readonly FichaResto[]
  /** Activos de la cartera para sugerir el recibido. */
  sugerencias: readonly string[]
  onClose: () => void
  onDone: () => void
}) {
  const titleId = useId()
  const toast = useToast()
  const queryClient = useQueryClient()
  const wallet = fichas[0]
  const [recibido, setRecibido] = useState('BNB')
  const [totalRaw, setTotalRaw] = useState('')
  const [partesRaw, setPartesRaw] = useState<Record<string, string>>({})
  const [fecha, setFecha] = useState(() => new Date().toISOString())
  const [preview, setPreview] = useState<ConversionRestosPreview | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const simbolo = recibido.trim().toUpperCase()
  const simboloOk = SYMBOL.test(simbolo) && !fichas.some(f => f.asset === simbolo)
  const total = parseNumeroLocal(totalRaw)
  const reparto = useMemo(() => (total && total > 0 ? repartirRecibido(fichas, total) : {}), [fichas, total])
  // Cada parte: la editada a mano o la del reparto proporcional.
  const partes = fichas.map(f => {
    const raw = partesRaw[f.key]
    return raw !== undefined ? parseNumeroLocal(raw) : reparto[f.key] ?? null
  })
  const partesOk = partes.every(p => p !== null && p > 0)
  const diferencia = total && partesOk ? descuadre(partes as number[], total) : 0
  const listo = simboloOk && total !== null && total > 0 && partesOk

  const datos = (): ConversionRestos => ({
    walletId: wallet.walletId,
    timestamp: fecha,
    recibido: simbolo,
    items: fichas.map((f, i) => ({ asset: f.asset, cantidad: f.quantity, recibido: partes[i] as number })),
  })
  const cambiar = (fn: () => void) => { fn(); setPreview(null); setError(null) }

  async function verResultado() {
    setCargando(true)
    setError(null)
    try { setPreview(await portfolioApi.previewConversionRestos(datos())) } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }
  async function registrar() {
    setCargando(true)
    setError(null)
    try {
      const r = await portfolioApi.createConversionRestos(datos())
      await queryClient.invalidateQueries()
      if (r.fifoError) toast.warning('Conversión registrada, pero el FIFO no se recalculó', r.fifoError)
      else toast.success(`Conversión de ${fichas.length} ${fichas.length === 1 ? 'resto' : 'restos'} a ${simbolo} registrada`)
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setCargando(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} size="lg">
      <ModalHeader titleId={titleId} onClose={onClose} icon={<ArrowRightLeft size={16} aria-hidden="true" />}
        title="Registrar conversión de restos"
        subtitle={<>Desde <span style={{ color: ink(wallet.walletColor) }} className="font-medium">{wallet.walletName}</span>: una permuta por resto, como la importación de Binance.</>} />
      <ModalBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={`${titleId}-recibido`} className="block text-xs font-medium text-fg-muted">Activo recibido</label>
            <input id={`${titleId}-recibido`} list={`${titleId}-sugerencias`} value={recibido} autoComplete="off"
              aria-invalid={recibido !== '' && !simboloOk} aria-describedby={`${titleId}-recibido-ayuda`}
              onChange={e => cambiar(() => setRecibido(e.target.value))}
              className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm mono uppercase text-fg focus:outline-hidden focus:border-brand" />
            <datalist id={`${titleId}-sugerencias`}>{sugerencias.map(s => <option key={s} value={s} />)}</datalist>
            <p id={`${titleId}-recibido-ayuda`} className={`text-[11px] ${recibido !== '' && !simboloOk ? 'text-negative-ink' : 'text-fg-subtle'}`}>
              {recibido !== '' && !simboloOk ? 'Símbolo no válido o es uno de los restos' : 'Por ejemplo, BNB'}
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${titleId}-total`} className="flex items-center gap-1 text-xs font-medium text-fg-muted">
              Total recibido
              <InfoTooltip label="Por qué ya neto de comisión">
                <p>Escribe lo que de verdad te llegó: el exchange ya descuenta su comisión (en Binance, un 2 % en BNB).</p>
              </InfoTooltip>
            </label>
            <input id={`${titleId}-total`} inputMode="decimal" autoComplete="off" value={totalRaw} placeholder="0,0012"
              aria-invalid={totalRaw !== '' && !(total && total > 0)}
              onChange={e => cambiar(() => { setTotalRaw(e.target.value); setPartesRaw({}) })}
              className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm mono text-fg focus:outline-hidden focus:border-brand" />
            <p className="text-[11px] text-fg-subtle">Ya neto de comisión</p>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${titleId}-fecha`} className="block text-xs font-medium text-fg-muted">Fecha de la conversión</label>
            <input id={`${titleId}-fecha`} type="datetime-local" step={1} value={toZonedInput(fecha, getAppTimezone())}
              onChange={e => e.target.value && cambiar(() => setFecha(fromZonedInput(e.target.value, getAppTimezone())))}
              className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm text-fg scheme-dark focus:outline-hidden focus:border-brand" />
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">Restos que se convierten y lo recibido por cada uno</caption>
            <thead>
              <tr className="border-b border-border bg-overlay/3 text-fg-subtle">
                <th scope="col" className="text-left px-3 py-2 font-medium">Resto</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">Cantidad</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">Recibido ({simboloOk ? simbolo : 'activo'})</th>
                {preview && <th scope="col" className="text-right px-3 py-2 font-medium">Resultado estimado</th>}
              </tr>
            </thead>
            <tbody>
              {fichas.map((f, i) => {
                const p = preview?.items.find(x => x.asset === f.asset)
                return (
                  <tr key={f.key} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium text-fg">
                      <span className="inline-flex items-center gap-2"><CryptoIcon symbol={f.asset} size={18} />{f.asset}</span>
                    </th>
                    <td className="px-3 py-2 text-right mono text-fg-muted">{formatAmount(f.quantity)}</td>
                    <td className="px-3 py-2 text-right">
                      <label htmlFor={`${titleId}-p-${i}`} className="sr-only">Recibido por {f.asset}</label>
                      <input id={`${titleId}-p-${i}`} inputMode="decimal" autoComplete="off"
                        value={partesRaw[f.key] ?? (reparto[f.key] !== undefined ? fmt8(reparto[f.key]) : '')}
                        aria-invalid={partes[i] !== null ? !(partes[i]! > 0) : (partesRaw[f.key] ?? '') !== ''}
                        onChange={e => cambiar(() => setPartesRaw(prev => ({ ...prev, [f.key]: e.target.value })))}
                        className="w-32 rounded-md border border-border bg-background-tertiary px-2 py-1 text-right mono text-fg focus:outline-hidden focus:border-brand" />
                    </td>
                    {preview && (
                      <td className={`px-3 py-2 text-right mono ${p?.gainLossEur != null ? pnlColor(p.gainLossEur) : 'text-fg-subtle'}`}>
                        {p?.gainLossEur != null ? `${p.gainLossEur >= 0 ? '+' : ''}${formatEur(p.gainLossEur)}` : 'Sin precio'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-fg-subtle">
          Lo recibido se reparte según el valor actual de cada resto; corrígelo si el exchange te da el desglose.
          {diferencia !== 0 && <span className="text-warning-ink"> Lo repartido {diferencia > 0 ? 'supera' : 'no llega a'} el total en {fmt8(Math.abs(diferencia))} {simbolo}.</span>}
        </p>

        {preview && (
          <Notice tipo="informacion" compact>
            {preview.totalGainLossEur !== null
              ? <>Resultado fiscal estimado: <span className={`mono font-semibold ${pnlColor(preview.totalGainLossEur)}`}>{preview.totalGainLossEur >= 0 ? '+' : ''}{formatEur(preview.totalGainLossEur)}</span>, con {simbolo} a {preview.precioRecibidoEur !== null ? formatEur(preview.precioRecibidoEur) : 'sin precio'} en esa fecha y el coste por FIFO global. Al registrar se recalcula el FIFO.</>
              : <>No hay precio de {simbolo} en esa fecha para estimar el resultado; se calculará al recalcular el FIFO.</>}
          </Notice>
        )}
        {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        {!preview
          ? <Button variant="primary" size="sm" onClick={() => void verResultado()} disabled={!listo || cargando}>Ver el resultado</Button>
          : <Button variant="primary" size="sm" onClick={() => void registrar()} disabled={!listo || cargando}>
              Registrar {fichas.length} {fichas.length === 1 ? 'permuta' : 'permutas'}
            </Button>}
      </ModalFooter>
    </Modal>
  )
}
