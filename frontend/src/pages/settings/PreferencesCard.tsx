import { useState, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, SlidersHorizontal } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { Dropdown } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { formatNumber } from '../../utils/format'
import { validateDust } from '../../utils/settingsValidation'
import {
  DUST_THRESHOLD_KEY, PRIVACY_ON_START_KEY, START_PAGES, START_PAGE_KEY,
  dustThresholdEur, privacyOnStart, startPage, type StartPage,
} from '../../utils/preferences'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'

// Preferencias de General (#446): umbral de polvo, privacidad al abrir y página
// de inicio. Se guardan al momento con Deshacer, como el resto de Ajustes (#445).

const eur = (n: number) => `${formatNumber(n, 2)}\u00a0€`
const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() }

function Row({ label, hint, htmlFor, children }: { label: string; hint: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/50 last:border-0 flex-wrap">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
        <p className="text-xs text-fg-subtle mt-0.5">{hint}</p>
      </div>
      {children}
    </div>
  )
}

export function PreferencesCard({ index = 0 }: { index?: number }) {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()
  // Valor guardado en el momento de aplicar (Deshacer se ejecuta más tarde).
  const current = () => queryClient.getQueryData<Record<string, string>>(['config'])

  async function save(key: string, value: string, message: string, previous: string, undoable = true) {
    try {
      await portfolioApi.setConfig(key, value)
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      confirm(key, message, undoable ? () => void save(key, previous, 'Valor anterior restaurado', value, false) : undefined)
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    }
  }

  // Umbral de polvo
  const dust = dustThresholdEur(config)
  const [dustDraft, setDustDraft] = useState<string | null>(null)
  const [dustError, setDustError] = useState<string | null>(null)
  function commitDust() {
    if (dustDraft === null) return
    const v = validateDust(dustDraft)
    if (!v.ok) { setDustError(v.error); return }
    setDustDraft(null)
    const previous = dustThresholdEur(current())
    if (v.value === previous) return
    void save(DUST_THRESHOLD_KEY, String(v.value), `Polvo por debajo de ${eur(v.value)}`, String(previous))
  }

  const privacy = privacyOnStart(config)
  const page = startPage(config)
  const pageLabel = (p: StartPage) => START_PAGES.find(s => s.value === p)?.label ?? 'Dashboard'

  return (
    <SettingsCard index={index} icon={SlidersHorizontal} title="Preferencias"
      status={<><SavedMark stamp={saved} id={DUST_THRESHOLD_KEY} /><SavedMark stamp={saved} id={PRIVACY_ON_START_KEY} /><SavedMark stamp={saved} id={START_PAGE_KEY} /></>}
      description="Cómo se comporta la app al abrirla y qué posiciones cuentan como polvo.">
      <div>
        <Row label="Umbral de polvo" htmlFor="pref-polvo"
          hint="Las posiciones que valen menos se agrupan aparte en Portfolio y no cuentan en los mejores y peores.">
          <div className="space-y-1 text-right">
            <div className={`inline-flex items-center bg-background-tertiary border rounded-lg overflow-hidden transition-colors ${dustError ? 'border-negative' : 'border-border focus-within:border-brand'}`}>
              <input id="pref-polvo" type="text" inputMode="decimal" value={dustDraft ?? formatNumber(dust, 2)}
                aria-invalid={!!dustError} aria-describedby={dustError ? 'pref-polvo-error' : undefined}
                onChange={e => { setDustDraft(e.target.value); setDustError(null) }}
                onBlur={commitDust} onKeyDown={blurOnEnter}
                className="px-3 py-2 text-sm mono bg-transparent text-fg w-24 text-right focus:outline-hidden" />
              <span className="px-3 py-2 text-sm text-fg-subtle border-l border-border bg-background-secondary">€</span>
            </div>
            {dustError && (
              <p id="pref-polvo-error" role="alert" className="text-xs text-negative-ink flex items-center justify-end gap-1">
                <AlertCircle size={11} aria-hidden="true" /> {dustError}. Se mantiene {eur(dust)}.
              </p>
            )}
          </div>
        </Row>

        <Row label="Privacidad al abrir" htmlFor="pref-privacidad"
          hint="La app arranca con los importes ocultos; se muestran desde el ojo de la barra superior.">
          <label className="inline-flex items-center cursor-pointer">
            <input id="pref-privacidad" type="checkbox" role="switch" checked={privacy} className="peer sr-only"
              onChange={e => {
                const next = e.target.checked
                void save(PRIVACY_ON_START_KEY, String(next), next ? 'La app abrirá con los importes ocultos' : 'La app abrirá con los importes visibles', String(!next))
              }} />
            <span aria-hidden="true"
              className="relative w-9 h-5 rounded-full bg-overlay/15 ring-1 ring-inset ring-fg-subtle/60 peer-checked:ring-0 transition-colors peer-checked:bg-brand-solid peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </Row>

        <Row label="Página de inicio" hint="La vista que se abre al entrar en la app.">
          <Dropdown label="Página de inicio" value={page} className="w-44"
            onChange={v => {
              const previous = startPage(current())
              if (v === previous) return
              void save(START_PAGE_KEY, v, `La app abrirá en ${pageLabel(v as StartPage)}`, previous)
            }}
            options={START_PAGES.map(p => ({ value: p.value, label: p.label }))} />
        </Row>
      </div>
    </SettingsCard>
  )
}
