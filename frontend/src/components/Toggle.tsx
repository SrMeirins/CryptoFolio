export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group w-fit">
      <div className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${
        checked ? 'bg-brand-solid text-on-brand' : 'bg-background-tertiary border border-border group-hover:border-fg-subtle'
      }`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-xs transition-transform duration-200 ${
          checked ? 'translate-x-4 bg-white' : 'bg-fg-subtle group-hover:bg-fg-muted'
        }`} />
      </div>
      <span className={`text-xs transition-colors ${checked ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted'}`}>
        {label}
      </span>
    </button>
  )
}
