import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Table, Landmark, ChevronDown } from 'lucide-react'
import { useClickOutside } from '../../hooks/useClickOutside'

const FORMATS = [
  { key: 'csv',      label: 'CSV Modelo 100', desc: 'Todas las operaciones', icon: FileText, color: 'text-accent-blue'  },
  { key: 'rentaweb', label: 'Renta Web',      desc: 'Formato oficial AEAT',  icon: Landmark,  color: 'text-accent-green' },
  { key: 'excel',    label: 'Excel',          desc: 'Para asesor fiscal',    icon: Table,     color: 'text-accent-amber' },
  { key: 'pdf',      label: 'PDF',            desc: 'Resumen formal',       icon: Download,  color: 'text-accent-red'   },
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
        className="flex items-center gap-2 px-4 py-2 bg-background-tertiary border border-border rounded-xl hover:bg-border transition-colors text-sm font-medium"
      >
        <Download size={14} />
        Exportar
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-background-card border border-border rounded-2xl shadow-2xl z-20 overflow-hidden" role="menu">
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
                <div className="text-[11px] text-gray-500">{f.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
