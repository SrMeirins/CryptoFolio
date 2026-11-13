// Atajos de teclado de la app (#535): un único registro para el panel de
// atajos. Si se añade o cambia un atajo, se actualiza aquí en el mismo cambio.

export type Atajo = readonly [teclas: readonly string[], que: string]

export interface GrupoAtajos { titulo: string; atajos: readonly Atajo[] }

export const ATAJOS_GENERALES: GrupoAtajos = {
  titulo: 'En toda la aplicación',
  atajos: [
    [['?'], 'Mostrar los atajos de teclado'],
    [['Esc'], 'Cerrar un diálogo, un panel o un menú'],
    [['Tab'], 'Ir al siguiente control; con Mayúsculas, al anterior'],
  ],
}

/** Atajos propios de cada pantalla, por ruta. */
export const ATAJOS_PANTALLA: Readonly<Record<string, GrupoAtajos>> = {
  '/portfolio': {
    titulo: 'Portfolio',
    atajos: [
      [['/'], 'Ir a la búsqueda'],
      [['Flecha arriba', 'Flecha abajo'], 'Moverse entre las posiciones de la tabla'],
      [['Inicio', 'Fin'], 'Primera o última posición'],
      [['S'], 'Simular la venta de la posición enfocada'],
      [['Intro'], 'Abrir el detalle de la posición enfocada'],
    ],
  },
  '/fiscal': {
    titulo: 'Fiscal',
    atajos: [
      [['1', '2', '3', '4'], 'Ir a Resumen, Operaciones, Modelo 721 o Planificar'],
      [['Flecha izquierda', 'Flecha derecha'], 'Ejercicio anterior o siguiente'],
      [['A'], 'En Planificar, añadir al plan la sugerencia enfocada'],
      [['Supr'], 'En el plan, quitar la venta enfocada'],
      [['P'], 'En Planificar, abrir o cerrar el plan'],
    ],
  },
  '/history': {
    titulo: 'Historial',
    atajos: [
      [['/'], 'Ir a la búsqueda'],
      [['Flecha izquierda', 'Flecha derecha'], 'Año anterior o siguiente; con el detalle abierto, transacción anterior o siguiente'],
      [['Flecha arriba', 'Flecha abajo'], 'Moverse entre filas de la tabla'],
      [['Inicio', 'Fin'], 'Primera o última fila de la página'],
      [['Intro'], 'Abrir el detalle de la fila'],
    ],
  },
}

/** Grupos que se muestran en una ruta: los de la pantalla, si los hay, y los generales. */
export function atajosDe(pathname: string): GrupoAtajos[] {
  const propio = ATAJOS_PANTALLA[pathname]
  return propio ? [propio, ATAJOS_GENERALES] : [ATAJOS_GENERALES]
}
