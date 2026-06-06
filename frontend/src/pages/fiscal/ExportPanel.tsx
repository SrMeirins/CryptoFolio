import { useState } from 'react'
import { Download, FileText, Table, ChevronDown, ChevronRight } from 'lucide-react'

export function ExportPanel({ year }: { year: number }) {
  const [open, setOpen] = useState(false)

  const formats = [
    { key: 'csv',      label: 'CSV Modelo 100',  desc: 'Todas las operaciones',  icon: FileText,     color: 'text-accent-blue'  },
    { key: 'rentaweb', label: 'Renta Web',         desc: 'Formato oficial AEAT',    icon: ChevronRight, color: 'text-accent-green' },
    { key: 'excel',    label: 'Excel',             desc: 'Para asesor fiscal',      icon: Table,        color: 'text-accent-amber' },
    { key: 'pdf',      label: 'PDF',               desc: 'Resumen formal',          icon: Download,     color: 'text-accent-red'   },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-background-tertiary border border-border rounded-xl hover:bg-border transition-colors text-sm font-medium"
      >
        <Download size={14} />
        Exportar
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-background-card border border-border rounded-2xl shadow-2xl z-20 overflow-hidden">
            {formats.map(f => (
              <button
                key={f.key}
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
        </>
      )}
    </div>
  )
}
