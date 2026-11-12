// Temas del panel «Cómo calculamos» (#493), en el orden en que se muestran.
export type TemaMetodo = 'fifo' | 'valoracion' | 'rentabilidad' | 'compensacion' | 'rendimientos' | 'modelo721'

export const TEMAS_METODO: readonly { id: TemaMetodo; titulo: string }[] = [
  { id: 'fifo', titulo: 'FIFO global por activo' },
  { id: 'valoracion', titulo: 'Valoración y precios' },
  { id: 'rentabilidad', titulo: 'Rentabilidad' },
  { id: 'compensacion', titulo: 'Compensación de pérdidas' },
  { id: 'rendimientos', titulo: 'Rendimientos' },
  { id: 'modelo721', titulo: 'Modelo 721' },
]

export const temaHeadingId = (tema: TemaMetodo) => `metodo-${tema}`
