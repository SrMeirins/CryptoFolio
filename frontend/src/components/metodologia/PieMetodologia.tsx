import { useState, type ReactNode } from 'react'
import { BookOpen } from 'lucide-react'
import { ComoCalculamos } from './ComoCalculamos'
import type { TemaMetodo } from './temas'

// Pie de metodología (#493) para las pantallas con cálculos: una línea con el
// método y el botón que abre «Cómo calculamos» en el tema de la pantalla.
export function PieMetodologia({ tema, children }: { tema: TemaMetodo; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <footer className="flex items-start gap-x-3 gap-y-1.5 flex-wrap px-1 text-xs text-fg-subtle">
      <p className="flex-1 min-w-[14rem] leading-relaxed">{children}</p>
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 shrink-0 text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
        <BookOpen size={13} aria-hidden="true" /> Cómo calculamos
      </button>
      {abierto && <ComoCalculamos inicial={tema} onClose={() => setAbierto(false)} />}
    </footer>
  )
}
