import { useId } from 'react'
import { FORMATOS, SECCIONES, type PrefsExport, type SeccionExport } from '../../../utils/exportFiscal'

// Formato y secciones de una exportación fiscal (#547), compartido por el
// diálogo de exportar y Ajustes > Fiscal. Cada formato dice para qué sirve;
// las secciones solo aplican a Excel y PDF (CSV y Renta Web tienen formato fijo).

export function SeleccionExport({ prefs, onChange }: { prefs: PrefsExport; onChange: (p: PrefsExport) => void }) {
  const uid = useId()
  const formato = FORMATOS.find(f => f.clave === prefs.formato)!
  function alternar(s: SeccionExport, marcada: boolean) {
    const secciones = marcada ? [...prefs.secciones, s] : prefs.secciones.filter(x => x !== s)
    if (secciones.length > 0) onChange({ ...prefs, secciones })
  }
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-fg mb-1.5">Formato</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {FORMATOS.map(f => (
            <label key={f.clave} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${prefs.formato === f.clave ? 'border-brand bg-brand/8' : 'border-border hover:border-fg-subtle'}`}>
              <input type="radio" name={`${uid}-formato`} checked={prefs.formato === f.clave} onChange={() => onChange({ ...prefs, formato: f.clave })}
                className="mt-0.5 accent-[var(--cf-brand-solid)]" />
              <span>
                <span className="block text-sm font-medium text-fg">{f.titulo}</span>
                <span className="block text-xs text-fg-subtle">{f.uso}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={!formato.conSecciones} aria-describedby={!formato.conSecciones ? `${uid}-fijo` : undefined} className="space-y-1.5">
        <legend className="text-xs font-medium text-fg mb-1.5">Qué incluir</legend>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {SECCIONES.map(s => {
            const marcada = prefs.secciones.includes(s.clave)
            const ultima = marcada && prefs.secciones.length === 1
            return (
              <label key={s.clave} className={`flex items-center gap-2 text-sm ${formato.conSecciones ? 'text-fg cursor-pointer' : 'text-fg-subtle'}`}>
                <input type="checkbox" checked={marcada} disabled={ultima} onChange={e => alternar(s.clave, e.target.checked)} className="accent-[var(--cf-brand-solid)]" />
                {s.titulo}
              </label>
            )
          })}
        </div>
        {!formato.conSecciones && <p id={`${uid}-fijo`} className="text-xs text-fg-subtle">{formato.titulo} tiene un formato fijo: siempre lleva todas sus filas.</p>}
      </fieldset>
    </div>
  )
}
