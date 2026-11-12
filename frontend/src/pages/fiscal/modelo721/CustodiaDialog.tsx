import { useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, MapPin, Trash2 } from 'lucide-react'
import { portfolioApi } from '../../../api/portfolio'
import { buttonClasses, Dropdown, fieldClasses, iconButtonClasses, Modal, ModalBody, ModalFooter, ModalHeader, QueryError } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { agruparFilas, reglaDe, textoEstado, textoOrigen } from '../../../utils/custodia721'
import { formatFiscalDate } from '../../../utils/fiscalTable'
import { PAISES_EXTRANJERO } from '../../../utils/paises'
import { invalidar721 } from './invalidar721'

// Cambiar la custodia de una o varias wallets (las subcuentas de un exchange)
// para el Modelo 721 (#545). Lo esencial es una pregunta: ¿en España o fuera?
// Desde cuándo y los datos de la entidad para el formulario son opcionales.
// Si la wallet es de un exchange que la app importa, se muestra su regla
// automática con las fuentes, y se puede volver a ella.

const fechaTexto = (d: string | null) => (d ? `Desde el ${formatFiscalDate(d)}` : 'Desde siempre')

export function CustodiaDialog({ titulo, wallets, onClose }: {
  /** Exchange o wallet, para el título y el nombre propuesto de la entidad. */
  titulo: string
  wallets: readonly { id: string; nombre: string }[]
  onClose: () => void
}) {
  const titleId = useId()
  const uid = useId()
  const qc = useQueryClient()
  const toast = useToast()
  const custodiaQ = useQuery({ queryKey: ['fiscal-custodia'], queryFn: portfolioApi.getCustodia })
  const ids = new Set(wallets.map(w => w.id))
  const todas = custodiaQ.data?.wallets ?? []
  const claveRegla = todas.find(w => ids.has(w.walletId))?.regla ?? null
  // Un exchange con regla automática se cambia entero: todas sus subcuentas, tengan o no saldo.
  const datos = claveRegla ? todas.filter(w => w.regla === claveRegla) : todas.filter(w => ids.has(w.walletId))
  const objetivo = datos.length > 0 ? datos.map(w => ({ id: w.walletId, nombre: w.nombre })) : wallets
  const regla = reglaDe(custodiaQ.data?.reglas ?? [], claveRegla)
  const filas = agruparFilas(datos)
  const hoy = datos[0]?.hoy
  const [enEspana, setEnEspana] = useState<boolean | null>(null)
  const [desde, setDesde] = useState('')
  const [nombre, setNombre] = useState(titulo)
  const [nif, setNif] = useState('')
  const [pais, setPais] = useState('')
  const [web, setWeb] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const varias = objetivo.length > 1

  async function ejecutar(accion: () => Promise<unknown>, ok: string) {
    setOcupado(true); setError(null)
    try {
      await accion()
      invalidar721(qc)
      toast.success(ok, titulo)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function guardar() {
    if (enEspana === null) return
    const entidad = nombre.trim()
      ? { nombre: nombre.trim(), nif: nif.trim() || null, pais: enEspana ? 'ES' : (pais || null), web: web.trim() || null }
      : null
    const d = { desde: desde || null, enEspana, entidad }
    if (await ejecutar(() => Promise.all(objetivo.map(w => portfolioApi.guardarCustodia(w.id, d))), 'Custodia guardada')) onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} closeOnOverlay={!ocupado}>
      <ModalHeader titleId={titleId} title={`Custodia de ${titulo}`} icon={<MapPin size={16} aria-hidden="true" />} onClose={ocupado ? undefined : onClose} />
      <ModalBody className="space-y-4 text-sm">
        {custodiaQ.isError && <QueryError what="la custodia" error={custodiaQ.error} onRetry={() => void custodiaQ.refetch()} />}
        {varias && <p className="text-xs text-fg-muted">Se aplica a sus {objetivo.length} wallets: {objetivo.map(w => w.nombre).join(', ')}.</p>}

        {hoy && (
          <div className="rounded-xl bg-overlay/4 px-3 py-2 text-xs space-y-0.5">
            <p className="text-fg"><span className="text-fg-subtle">Hoy: </span>{textoEstado(hoy.enEspana)}{hoy.entidad ? ` (${hoy.entidad.nombre})` : ''}</p>
            <p className="text-fg-subtle">{textoOrigen(hoy.origen, regla?.exchange ?? null)}</p>
          </div>
        )}

        {regla && (
          <section aria-labelledby={`${uid}-regla`} className="space-y-1.5 text-xs">
            <h3 id={`${uid}-regla`} className="font-medium text-fg">Regla automática de {regla.exchange}</h3>
            <ul className="space-y-0.5 text-fg-muted">
              {regla.tramos.map(t => (
                <li key={t.desde ?? 'siempre'}>{fechaTexto(t.desde)}: {t.enEspana ? 'en España' : 'fuera de España'} ({t.entidad.nombre})</li>
              ))}
            </ul>
            {regla.nota && <p className="text-fg-subtle">{regla.nota}</p>}
            <p className="flex flex-wrap gap-x-3">
              {regla.fuentes.map(f => (
                <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-ink hover:underline">
                  {f.titulo}<ExternalLink size={10} aria-hidden="true" /><span className="sr-only"> (se abre en otra pestaña)</span>
                </a>
              ))}
            </p>
          </section>
        )}

        {filas.length > 0 && (
          <table className="w-full text-xs">
            <caption className="text-left font-medium text-fg pb-1">Lo que has indicado</caption>
            <thead className="sr-only"><tr><th scope="col">Desde</th><th scope="col">Custodia</th><th scope="col">Acciones</th></tr></thead>
            <tbody className="divide-y divide-border/60">
              {filas.map(f => (
                <tr key={f.ids.join()}>
                  <td className="py-1.5 pr-2 text-fg-muted whitespace-nowrap">{fechaTexto(f.desde)}</td>
                  <td className="py-1.5 pr-2 text-fg">{f.enEspana ? 'En España' : 'Fuera de España'}{f.entidad ? ` (${f.entidad.nombre})` : ''}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" disabled={ocupado} aria-label={`Quitar «${fechaTexto(f.desde)}»`}
                      onClick={() => void ejecutar(() => Promise.all(f.ids.map(id => portfolioApi.quitarFilaCustodia(id))), 'Quitado')}
                      className={iconButtonClasses('sm')}><Trash2 size={13} aria-hidden="true" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <fieldset className="space-y-3 rounded-xl border border-border px-3 py-3">
          <legend className="px-1 text-xs font-medium text-fg">{filas.length > 0 || regla ? 'Indicar otra cosa' : '¿Dónde está la custodia?'}</legend>
          <div role="radiogroup" aria-label="Dónde está la custodia" className="flex gap-2 flex-wrap">
            {([[true, 'En España'], [false, 'Fuera de España']] as const).map(([v, label]) => (
              <label key={label} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${enEspana === v ? 'border-brand bg-brand/10 text-fg' : 'border-border text-fg-muted'}`}>
                <input type="radio" name={`${uid}-donde`} checked={enEspana === v} onChange={() => setEnEspana(v)} className="accent-[var(--cf-brand-solid)]" />
                {label}
              </label>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="block text-xs text-fg-muted">Desde (vacío: desde siempre)</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} min="2009-01-01" className={fieldClasses('sm', false, 'w-auto px-2 py-1')} />
          </label>
          <details className="group text-xs">
            <summary className="cursor-pointer text-brand-ink">Datos para el formulario del 721 (opcional)</summary>
            <div className="mt-2 space-y-2">
              <p className="text-fg-subtle">Aparecen en el contrato o las condiciones de tu cuenta del exchange. Solo hacen falta al rellenar el modelo.</p>
              <label className="block space-y-1">
                <span className="block text-fg-muted">Nombre de la sociedad</span>
                <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} className={fieldClasses('sm', false, 'w-full')} />
              </label>
              <label className="block space-y-1">
                <span className="block text-fg-muted">NIF en su país</span>
                <input value={nif} onChange={e => setNif(e.target.value)} maxLength={32} className={fieldClasses('sm', false, 'w-48 mono')} />
              </label>
              {enEspana === false && (
                <div className="space-y-1">
                  <span className="block text-fg-muted" aria-hidden="true">País</span>
                  <Dropdown size="sm" label="País de la sociedad" value={pais} placeholder="Sin indicar"
                    options={[{ value: '', label: 'Sin indicar' }, ...PAISES_EXTRANJERO.map(p => ({ value: p.codigo, label: p.nombre }))]} onChange={setPais} />
                </div>
              )}
              <label className="block space-y-1">
                <span className="block text-fg-muted">Domicilio o web</span>
                <input value={web} onChange={e => setWeb(e.target.value)} maxLength={200} className={fieldClasses('sm', false, 'w-full')} />
              </label>
            </div>
          </details>
        </fieldset>
        {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
      </ModalBody>
      <ModalFooter>
        {filas.length > 0 && (
          <button type="button" disabled={ocupado} className={buttonClasses('ghost', 'sm', 'mr-auto')}
            onClick={() => void ejecutar(() => Promise.all(objetivo.map(w => portfolioApi.restablecerCustodia(w.id))), regla ? 'Vuelve a lo automático' : 'Quitado lo indicado')}>
            {regla ? 'Volver a lo automático' : 'Quitar lo indicado'}
          </button>
        )}
        <button type="button" onClick={onClose} disabled={ocupado} className={buttonClasses('ghost', 'sm')}>Cerrar</button>
        <button type="button" onClick={() => void guardar()} disabled={ocupado || enEspana === null} className={buttonClasses('primary', 'sm')}>Guardar</button>
      </ModalFooter>
    </Modal>
  )
}
