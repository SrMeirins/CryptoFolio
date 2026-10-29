import { useState } from 'react'
import { ChevronDown, ExternalLink, Info } from 'lucide-react'
import { APP_CHANGELOG, APP_VERSION, REPO_LINKS } from '../../constants/appInfo'
import { changelogBlocks } from '../../utils/changelog'
import { SettingsCard } from './SettingsCard'

// Acerca de (#447): versión real, novedades de la versión (sección del
// CHANGELOG incluida al compilar, como texto), enlaces al repositorio, la
// licencia y la política de seguridad, y el aviso de información orientativa.

const FACTS = [
  ['Método fiscal', 'FIFO, normativa española (AEAT)'],
  ['Fuente de precios', 'Binance, con CoinGecko y otros de respaldo'],
  ['Base de datos', 'PostgreSQL'],
] as const

export function AboutCard({ index = 0 }: { index?: number }) {
  const [open, setOpen] = useState(false)
  const blocks = changelogBlocks(APP_CHANGELOG)

  return (
    <SettingsCard index={index} icon={Info} title="Acerca de CryptoFolio">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
        <dt className="text-fg-subtle">Versión</dt><dd className="mono text-fg text-right">{APP_VERSION}</dd>
        {FACTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-subtle">{k}</dt><dd className="text-fg-muted text-right">{v}</dd>
          </div>
        ))}
      </dl>

      {blocks.length > 0 && (
        <div className="rounded-xl border border-border">
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="novedades-version"
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium rounded-xl hover:bg-overlay/3 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            Novedades de la versión {APP_VERSION}
            <ChevronDown size={14} aria-hidden="true" className={`text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div id="novedades-version" className="px-4 pb-4 space-y-3 text-xs text-fg-muted">
              {blocks.map((b, i) => (
                <div key={`${b.heading}-${i}`}>
                  {b.heading && <p className="font-semibold text-fg mb-1">{b.heading}</p>}
                  <ul className="list-disc pl-4 space-y-1">
                    {b.items.map((it, j) => <li key={j} className="leading-relaxed">{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {REPO_LINKS.map(l => (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand-ink hover:underline rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              {l.label} <ExternalLink size={11} aria-hidden="true" /><span className="sr-only"> (se abre en una ventana nueva)</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="text-xs text-fg-subtle pt-2 border-t border-border">
        Esta herramienta genera información orientativa. Consulta siempre con un asesor fiscal antes de presentar tu declaración.
      </p>
    </SettingsCard>
  )
}
