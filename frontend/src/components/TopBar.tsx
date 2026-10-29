import { StatusIndicator } from './StatusIndicator'
import { CurrencyToggle } from './CurrencyToggle'
import { ThemeToggle } from './ThemeToggle'
import { PrivacyToggle } from './PrivacyToggle'
import { NotificationsBell } from './NotificationsBell'

// Barra superior (#200): 64 px, igual que la cabecera de la barra lateral, para
// que sus bordes inferiores coincidan. Solo estado, moneda, tema y avisos.
export function TopBar() {
  return (
    <div className="shrink-0 h-16 flex items-center justify-end gap-3 px-5 border-b border-border bg-background-secondary">
      <StatusIndicator />
      <CurrencyToggle />
      <ThemeToggle />
      <PrivacyToggle />
      <NotificationsBell />
    </div>
  )
}
