import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Table, Landmark, ChevronDown } from 'lucide-react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { cardClasses, buttonClasses } from '../../components/ui'

const FORMATS = [
  { key: 'csv',      label: 'CSV Modelo 100', desc: 'Todas las operaciones', icon: FileText, color: 'text-brand'  },
  { key: 'rentaweb', label: 'Renta Web',      desc: 'Formato oficial AEAT',  icon: Landmark,  color: 'text-positive' },
  { key: 'excel',    label: 'Excel',          desc: 'Para asesor fiscal',    icon: Table,     color: 'text-warning' },
  { key: 'pdf',      label: 'PDF',            desc: 'Resumen formal',       icon: Download,  color: 'text-negative'   },
]

export function ExportPanel({ year }: { year: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false), open)

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClasses('secondary', 'md', 'flex')}
      >
        <Download size={14} />
        Exportar
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={cardClasses('none', 'absolute right-0 top-full mt-2 w-56 shadow-2xl z-20 overflow-hidden')} role="menu">
          {FORMATS.map(f => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              onClick={() => { window.open(`/api/fiscal/${year}/export?format=${f.key}`, '_blank'); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-background-tertiary transition-colors text-left"
            >
              <f.icon size={16} className={f.color} />
              <div>
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-fg-subtle">{f.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
