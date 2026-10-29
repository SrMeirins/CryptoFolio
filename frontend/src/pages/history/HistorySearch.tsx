import { forwardRef, useId, useMemo, useState } from 'react'
import { Search, X, Wallet } from 'lucide-react'
import { CryptoIcon } from '../../components/CryptoIcon'
import { iconButtonClasses } from '../../components/ui'
import type { HistoryFilterState } from './urlState'
import { searchSuggestions, type Suggestion } from './toolbarLogic'

// Buscador del Historial (#414): destacado, con el atajo «/» visible y
// sugerencias de activos y wallets que, al elegirlas, añaden su filtro y
// limpian el texto. Combobox WAI-ARIA: flechas para moverse, Enter elige,
// Escape cierra. Sin elegir sugerencia, busca el texto como siempre.

export const HistorySearch = forwardRef<HTMLInputElement, {
  value: string
  onChange: (v: string) => void
  onClear: () => void
  assets: readonly string[]
  wallets: readonly { id: string; name: string }[]
  filters: Pick<HistoryFilterState, 'assets' | 'wallet_id'>
  onPick: (s: Suggestion) => void
}>(function HistorySearch({ value, onChange, onClear, assets, wallets, filters, onPick }, ref) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const suggestions = useMemo(() => searchSuggestions(value, assets, wallets, filters), [value, assets, wallets, filters])
  const expanded = open && suggestions.length > 0

  function pick(s: Suggestion) {
    onPick(s)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault(); setOpen(true); setActive(a => (a + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault(); setOpen(true); setActive(a => (a <= 0 ? suggestions.length - 1 : a - 1))
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault(); pick(suggestions[active])
    } else if (e.key === 'Escape' && expanded) {
      e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1)
    }
  }

  return (
    // En pantallas estrechas ocupa la fila entera; en anchas, hasta 28 rem.
    <div className="relative basis-full min-w-0 sm:basis-auto sm:flex-1 sm:min-w-56 sm:max-w-md">
      <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label="Buscar por activo, nota, hash o archivo (atajo: /)"
        aria-keyshortcuts="/"
        placeholder="Buscar activo, wallet, nota, hash…"
        value={value}
        maxLength={100}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full bg-background-tertiary border border-border rounded-xl pl-9 pr-16 py-2 text-sm text-fg placeholder-fg-subtle transition-colors hover:border-brand/30 focus:outline-hidden focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/30 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {value && (
          <button type="button" onClick={onClear} aria-label="Limpiar búsqueda" className={iconButtonClasses('sm', false, 'w-6 h-6')}>
            <X size={12} aria-hidden="true" />
          </button>
        )}
        <kbd aria-hidden="true" className="px-1.5 py-0.5 rounded-md border border-border text-[10px] text-fg-subtle mono">/</kbd>
      </span>
      {expanded && (
        <ul id={listId} role="listbox" aria-label="Sugerencias"
          className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-background-card shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] p-1">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}-${s.value}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              // mousedown: elegir antes de que el blur cierre la lista.
              onMouseDown={e => { e.preventDefault(); pick(s) }} onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm cursor-pointer ${i === active ? 'bg-brand/12 text-fg' : 'text-fg-muted'}`}>
              {s.kind === 'asset' ? <CryptoIcon symbol={s.value} size={16} /> : <Wallet size={14} aria-hidden="true" className="text-fg-subtle" />}
              <span className="flex-1 truncate">{s.label}</span>
              <span className="text-[11px] text-fg-subtle">{s.kind === 'asset' ? 'Filtrar activo' : 'Filtrar wallet'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
