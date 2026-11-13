import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type VentaPlanGuardada } from '../../../api/portfolio'
import { useDebounce } from '../../../hooks/useDebounce'
import { ventasParaSimular } from '../../../utils/planVentas'

// Estado del plan de ventas (#546). El plan del año en curso se lee del
// servidor y se edita en local; cada cambio se guarda tras una breve espera.
// Su efecto se pide al backend al cambiar el plan o la comisión y, con precios
// en vivo, cada 30 segundos (no en cada tic del feed).
// consulta de fondo (#498): el hook devuelve planQ y efectoQ y sus fallos los
// muestra PlanBarra con QueryError y «Reintentar».

export const COMISION_PLAN_KEY = 'plan_comision_pct'
const ESPERA_GUARDAR_MS = 600
const REFRESCO_MS = 30_000

export function usePlan(prices: Readonly<Record<string, number>>) {
  const qc = useQueryClient()
  const planQ = useQuery({ queryKey: ['fiscal-plan'], queryFn: () => portfolioApi.getPlan() })
  const [local, setLocal] = useState<VentaPlanGuardada[] | null>(null)
  const [comisionLocal, setComisionLocal] = useState<number | null>(null)
  const [errorGuardar, setErrorGuardar] = useState<unknown>(null)
  const ventas = useMemo(() => local ?? planQ.data?.ventas ?? [], [local, planQ.data])
  const comisionPct = comisionLocal ?? planQ.data?.comisionPct ?? 0.1

  // Guardado con espera: solo lo último que se editó.
  const guardarEn = useRef<ReturnType<typeof setTimeout> | null>(null)
  function cambiar(next: VentaPlanGuardada[]) {
    setLocal(next)
    if (guardarEn.current) clearTimeout(guardarEn.current)
    guardarEn.current = setTimeout(() => {
      portfolioApi.guardarPlan(next.map(({ asset, walletId, cantidad, precioEur }) => ({ asset, walletId, cantidad, precioEur })))
        .then(() => { setErrorGuardar(null); void qc.invalidateQueries({ queryKey: ['fiscal-plan-ajustes'] }) })
        .catch((e: unknown) => setErrorGuardar(e))
    }, ESPERA_GUARDAR_MS)
  }
  useEffect(() => () => { if (guardarEn.current) clearTimeout(guardarEn.current) }, [])

  const comisionEn = useRef<ReturnType<typeof setTimeout> | null>(null)
  function cambiarComision(pct: number) {
    setComisionLocal(pct)
    if (comisionEn.current) clearTimeout(comisionEn.current)
    comisionEn.current = setTimeout(() => {
      portfolioApi.setConfig(COMISION_PLAN_KEY, String(pct))
        .then(() => void qc.invalidateQueries({ queryKey: ['config'] }))
        .catch((e: unknown) => setErrorGuardar(e))
    }, ESPERA_GUARDAR_MS)
  }

  // Precios en vivo: una foto que se renueva al cambiar el plan, cada 30 s y
  // cuando llegan los que faltaban, no en cada tic del feed.
  const [tic, setTic] = useState(0)
  useEffect(() => {
    if (ventas.length === 0) return
    const id = setInterval(() => setTic(t => t + 1), REFRESCO_MS)
    return () => clearInterval(id)
  }, [ventas.length])
  // Hasta que el feed tenga precio de todos los activos, se reintenta al llegar.
  const conPrecio = ventas.every(v => v.precioEur !== null || (prices[v.asset] ?? 0) > 0)
  const claveFoto = `${tic}|${conPrecio}|${JSON.stringify(ventas)}`
  const [foto, setFoto] = useState({ clave: claveFoto, prices })
  // Estado derivado durante el render (patrón de React, sin efecto).
  if (foto.clave !== claveFoto) setFoto({ clave: claveFoto, prices })
  const paraSimular = useMemo(() => ventasParaSimular(ventas, foto.prices), [ventas, foto])
  const peticion = useDebounce(useMemo(() => (paraSimular && paraSimular.length > 0 ? { ventas: paraSimular, comisionPct } : null), [paraSimular, comisionPct]), 400)

  const efectoQ = useQuery({
    queryKey: ['fiscal-plan-simular', peticion],
    queryFn: () => portfolioApi.simularPlan(peticion!.ventas, peticion!.comisionPct),
    enabled: peticion !== null,
    placeholderData: keepPreviousData,
  })

  return {
    planQ, ventas, comisionPct, cambiar, cambiarComision, errorGuardar,
    efecto: ventas.length > 0 ? efectoQ.data ?? null : null,
    efectoQ,
    calculadoEn: efectoQ.dataUpdatedAt || null,
    esperandoPrecios: ventas.length > 0 && !conPrecio,
  }
}
