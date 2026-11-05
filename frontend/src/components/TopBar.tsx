import { useRef, useState } from 'react'
import { Menu, SlidersHorizontal } from 'lucide-react'
import { StatusIndicator } from './StatusIndicator'
import { CurrencyToggle } from './CurrencyToggle'
import { ThemeToggle } from './ThemeToggle'
import { PrivacyToggle } from './PrivacyToggle'
import { NotificationsBell } from './NotificationsBell'
import { Popover, iconButtonClasses } from './ui'
import { NARROW_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useNavStore } from '../store/navStore'

// Barra superior (#200): 64 px, igual que la cabecera de la barra lateral, para
// que sus bordes inferiores coincidan. Solo estado, moneda, tema y avisos.
// En pantallas estrechas (#499) muestra el botón del menú y agrupa moneda y
// tema en «Vista» para no cortarse.
export function TopBar() {
  const narrow = useMediaQuery(NARROW_QUERY)
  const mobileOpen = useNavStore(s => s.mobileOpen)
  const setMobileOpen = useNavStore(s => s.setMobileOpen)
  const [vistaOpen, setVistaOpen] = useState(false)
  const vistaRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="shrink-0 h-16 flex items-center justify-end gap-2 sm:gap-3 px-3 sm:px-5 border-b border-border bg-background-secondary min-w-0">
      {narrow && (
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir el menú" aria-expanded={mobileOpen} aria-controls="menu-principal"
          className={iconButtonClasses('md', false, 'mr-auto')}>
          <Menu size={18} aria-hidden="true" />
        </button>
      )}
      <StatusIndicator />
      {narrow ? (
        <>
          <button ref={vistaRef} type="button" onClick={() => setVistaOpen(o => !o)} aria-haspopup="dialog" aria-expanded={vistaOpen}
            aria-label="Vista: moneda y tema" className={iconButtonClasses('md')}>
            <SlidersHorizontal size={16} aria-hidden="true" />
          </button>
          <Popover open={vistaOpen} onClose={() => setVistaOpen(false)} anchorRef={vistaRef} align="end"
            className="p-3 space-y-3" ariaProps={{ role: 'dialog', 'aria-label': 'Vista' }}>
            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">Moneda <CurrencyToggle /></div>
            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">Tema <ThemeToggle /></div>
          </Popover>
        </>
      ) : (
        <>
          <CurrencyToggle />
          <ThemeToggle />
        </>
      )}
      <PrivacyToggle />
      <NotificationsBell />
    </div>
  )
}
