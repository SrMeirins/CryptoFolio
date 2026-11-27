import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { conexionesApi } from '../../../api/conexiones'
import { estadoClave, faltaClave } from '../../../utils/conexiones'

// Atajos a Ajustes › Conexiones (versión 1.0) desde las wallets: la clave de
// API es de la red (Etherscan para Ethereum…), no de cada dirección, así que
// se edita en un único sitio y aquí solo se avisa y se enlaza.

const destino = (id: string) => ({ pathname: '/settings', search: '?tab=conexiones', hash: `#conexion-${id}` })
const enlace = 'inline-flex items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-brand hover:underline'

function useServicioDeRed(red: string | null | undefined) {
  // consulta de fondo (#498): si falla, simplemente no se muestra el atajo.
  const { data } = useQuery({ queryKey: ['conexiones'], queryFn: conexionesApi.listar, enabled: !!red })
  return red ? data?.servicios.find(s => s.red === red) : undefined
}

/** En la fila de una dirección: aviso enlazado solo si a su red le falta la clave. */
export function AvisoClaveRed({ red }: { red: string | null | undefined }) {
  const s = useServicioDeRed(red)
  if (!s || !faltaClave(s)) return null
  return (
    <Link to={destino(s.id)} className={`${enlace} shrink-0 text-[11px] text-warning-ink`}>
      <KeyRound size={11} aria-hidden="true" />
      {s.estado === 'ilegible' ? `Clave de ${s.nombre} ilegible` : `Falta la clave de ${s.nombre}`}
    </Link>
  )
}

/** Al añadir una dirección: si la red necesita clave, su estado y el enlace para gestionarla. */
export function EstadoClaveRed({ red }: { red: string | null | undefined }) {
  const s = useServicioDeRed(red)
  if (!s) return null
  const configurada = s.estado === 'configurada' || s.estado === 'entorno'
  return (
    <p className="text-xs text-fg-subtle pt-1">
      Para comprobar el saldo on-chain, {s.red} necesita una clave de {s.nombre}: {estadoClave(s).texto.toLowerCase()}.{' '}
      <Link to={destino(s.id)} className={`${enlace} text-brand-ink`}>
        {configurada ? 'Gestionar en Conexiones' : 'Configurarla en Conexiones'}
      </Link>
    </p>
  )
}
