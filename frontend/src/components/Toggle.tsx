export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group w-fit">
      <div className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${
        checked ? 'bg-accent-blue' : 'bg-background-tertiary border border-border group-hover:border-gray-500'
      }`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4 bg-white' : 'bg-gray-500 group-hover:bg-gray-400'
        }`} />
      </div>
      <span className={`text-xs transition-colors ${checked ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}`}>
        {label}
      </span>
    </button>
  )
}
