import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../../api/portfolio'
import { buttonClasses } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { invalidar721 } from './invalidar721'

// Pregunta de una wallet de exchange cuya custodia no se sabe (#545): tres
// botones. «No lo sé» no guarda nada (sigue computando por prudencia) y solo
// pliega la pregunta en este navegador.

const CLAVE = 'cf-721-no-lo-se'

function leerNoLoSe(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as string[] } catch { return [] }
}
function guardarNoLoSe(ids: string[]) {
  try { localStorage.setItem(CLAVE, JSON.stringify(ids)) } catch { /* sin almacenamiento: solo dura esta visita */ }
}

export function PreguntaCustodia({ wallet }: { wallet: { id: string; nombre: string } }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [plegada, setPlegada] = useState(() => leerNoLoSe().includes(wallet.id))
  const [ocupado, setOcupado] = useState(false)

  async function responder(enEspana: boolean) {
    setOcupado(true)
    try {
      await portfolioApi.guardarCustodia(wallet.id, { desde: null, enEspana, entidad: null })
      invalidar721(qc)
      toast.success('Custodia guardada', `${wallet.nombre}: ${enEspana ? 'en España' : 'fuera de España'}`)
    } catch (e) {
      toast.fail('No se pudo guardar la custodia', e)
      setOcupado(false)
    }
  }

  function noLoSe(v: boolean) {
    const ids = leerNoLoSe().filter(x => x !== wallet.id)
    guardarNoLoSe(v ? [...ids, wallet.id] : ids)
    setPlegada(v)
  }

  if (plegada) {
    return (
      <p className="text-xs text-fg-subtle">
        {wallet.nombre}: no sabes dónde está la custodia, así que computa por prudencia.{' '}
        <button type="button" onClick={() => noLoSe(false)} className="text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">Responder</button>
      </p>
    )
  }
  return (
    <div role="group" aria-label={`¿Dónde está la custodia de ${wallet.nombre}?`} className="flex items-center gap-2 flex-wrap text-xs">
      <span className="text-fg-muted">¿Dónde está la custodia de <strong className="font-medium text-fg">{wallet.nombre}</strong>?</span>
      <button type="button" disabled={ocupado} onClick={() => void responder(true)} className={buttonClasses('secondary', 'sm')}>En España</button>
      <button type="button" disabled={ocupado} onClick={() => void responder(false)} className={buttonClasses('secondary', 'sm')}>Fuera de España</button>
      <button type="button" disabled={ocupado} onClick={() => noLoSe(true)} className={buttonClasses('ghost', 'sm')}>No lo sé</button>
    </div>
  )
}
