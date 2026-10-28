import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { type Tramo, TRAMOS_DEFAULT, tramosDeEscala } from '../utils/tramosIrpf'

/** Clave de la escala de un ejercicio, compartida con Ajustes al guardarla. */
export const escalaKey = (year: number) => ['irpf-escala', year] as const

/**
 * Tramos IRPF del ahorro de un ejercicio (#452): la escala oficial de ese año
 * con los tipos cambiados en Ajustes → Fiscal. Sin año, el en curso. Mientras
 * llega, la escala vigente.
 */
export function useTramos(year: number = new Date().getFullYear()): Tramo[] {
  const { data } = useQuery({ queryKey: escalaKey(year), queryFn: () => portfolioApi.getEscala(year), staleTime: 5 * 60_000 })
  return data ? tramosDeEscala(data.tramos) : TRAMOS_DEFAULT
}
