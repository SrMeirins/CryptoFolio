import { useState, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, SlidersHorizontal } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { Dropdown, QueryError, SegmentedControl } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { formatNumber } from '../../utils/format'
import { validateDust } from '../../utils/settingsValidation'
import {
  CONCENTRACION_KEY, WALLETS_OTRAS_KEY, DUST_THRESHOLD_KEY, PRIVACY_ON_START_KEY, START_PAGES, START_PAGE_KEY,
  concentracionAvisoPct, walletsOtrasPct, dustThresholdEur, privacyOnStart, startPage, type StartPage,
} from '../../utils/preferences'
import { SettingsCard } from './SettingsCard'
import { ColumnasSelector } from '../../components/ColumnasSelector'
import { PORTFOLIO_COLUMNAS_KEY, portfolioColumnas, serializarColumnas } from '../../utils/portfolioColumns'
import { GRAFICO_MARCAS_KEY, MARCAS_OPCIONES, marcasGrafico, marcasLabel, type MarcasGrafico } from '../../utils/graficoMarcas'
import { DENSIDAD_OPCIONES, HISTORIAL_DENSIDAD_KEY, densidadHistorial } from '../../utils/historialDensidad'
import { SavedMark } from './SavedMark'
import { failure } from '../../utils/queryFailure'

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
  const configQ = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const { data: config } = configQ
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
      toast.fail('No se pudo guardar', e)
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
    void save(DUST_THRESHOLD_KEY, String(v.value), `Saldos residuales por debajo de ${eur(v.value)}`, String(previous))
  }

  // Aviso de concentración de Portfolio (#525): porcentaje entero de 10 a 100.
  const concentracion = concentracionAvisoPct(config)
  const [concDraft, setConcDraft] = useState<string | null>(null)
  const [concError, setConcError] = useState<string | null>(null)
  function commitConcentracion() {
    if (concDraft === null) return
    const n = Number(concDraft.trim())
    if (!/^\d{2,3}$/.test(concDraft.trim()) || n < 10 || n > 100) { setConcError('Escribe un porcentaje entero de 10 a 100'); return }
    setConcDraft(null)
    const previous = concentracionAvisoPct(current())
    if (n === previous) return
    void save(CONCENTRACION_KEY, String(n), `Aviso de concentración por encima del ${n} %`, String(previous))
  }

  // Wallets en «Otras» de Portfolio (#526): porcentaje entero de 0 (nunca) a 20.
  const otras = walletsOtrasPct(config)
  const [otrasDraft, setOtrasDraft] = useState<string | null>(null)
  const [otrasError, setOtrasError] = useState<string | null>(null)
  function commitOtras() {
    if (otrasDraft === null) return
    const n = Number(otrasDraft.trim())
    if (!/^\d{1,2}$/.test(otrasDraft.trim()) || n > 20) { setOtrasError('Escribe un porcentaje entero de 0 a 20'); return }
    setOtrasDraft(null)
    const previous = walletsOtrasPct(current())
    if (n === previous) return
    void save(WALLETS_OTRAS_KEY, String(n), n === 0 ? 'Ninguna wallet se agrupa en «Otras»' : `Las wallets de menos del ${n} % van a «Otras»`, String(previous))
  }

  // Columnas de la tabla de posiciones (#527), las mismas que se eligen en Portfolio.
  const columnas = portfolioColumnas(config)
  // Marcas del gráfico del detalle del activo (#528), las mismas que se eligen en el gráfico.
  const marcas = marcasGrafico(config)
  // Densidad de la tabla del Historial (#552), la misma que en sus opciones de vista.
  const densidad = densidadHistorial(config)

  const privacy = privacyOnStart(config)
  const page = startPage(config)
  const pageLabel = (p: StartPage) => START_PAGES.find(s => s.value === p)?.label ?? 'Dashboard'

  // Sin la configuración, los valores mostrados serían los predeterminados (#498).
  const fallo = failure(configQ)
  return (
    <SettingsCard index={index} icon={SlidersHorizontal} title="Preferencias"
      status={<><SavedMark stamp={saved} id={DUST_THRESHOLD_KEY} /><SavedMark stamp={saved} id={PRIVACY_ON_START_KEY} /><SavedMark stamp={saved} id={START_PAGE_KEY} /><SavedMark stamp={saved} id={CONCENTRACION_KEY} /><SavedMark stamp={saved} id={WALLETS_OTRAS_KEY} /><SavedMark stamp={saved} id={PORTFOLIO_COLUMNAS_KEY} /><SavedMark stamp={saved} id={GRAFICO_MARCAS_KEY} /><SavedMark stamp={saved} id={HISTORIAL_DENSIDAD_KEY} /></>}
      description="Cómo se comporta la app al abrirla, qué posiciones cuentan como saldos residuales y cuándo avisar de una cartera concentrada.">
      {fallo && <QueryError what="tus preferencias" error={fallo.error} onRetry={fallo.retry} className="mb-3 rounded-xl border border-border" />}
      <div>
        <Row label="Umbral de saldos residuales" htmlFor="pref-polvo"
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

        <Row label="Aviso de concentración" htmlFor="pref-concentracion"
          hint="Portfolio avisa en «Mayor posición» si un activo pesa más que este porcentaje de la cartera.">
          <div className="space-y-1 text-right">
            <div className={`inline-flex items-center bg-background-tertiary border rounded-lg overflow-hidden transition-colors ${concError ? 'border-negative' : 'border-border focus-within:border-brand'}`}>
              <input id="pref-concentracion" type="text" inputMode="numeric" value={concDraft ?? String(concentracion)} maxLength={3}
                aria-invalid={!!concError} aria-describedby={concError ? 'pref-concentracion-error' : undefined}
                onChange={e => { setConcDraft(e.target.value); setConcError(null) }}
                onBlur={commitConcentracion} onKeyDown={blurOnEnter}
                className="px-3 py-2 text-sm mono bg-transparent text-fg w-16 text-right focus:outline-hidden" />
              <span className="px-3 py-2 text-sm text-fg-subtle border-l border-border bg-background-secondary">%</span>
            </div>
            {concError && (
              <p id="pref-concentracion-error" role="alert" className="text-xs text-negative-ink flex items-center justify-end gap-1">
                <AlertCircle size={11} aria-hidden="true" /> {concError}. Se mantiene el {concentracion} %.
              </p>
            )}
          </div>
        </Row>

        <Row label="Wallets en «Otras»" htmlFor="pref-otras"
          hint="En Portfolio, las wallets que pesan menos que este porcentaje se juntan en una tarjeta «Otras». Con 0, ninguna.">
          <div className="space-y-1 text-right">
            <div className={`inline-flex items-center bg-background-tertiary border rounded-lg overflow-hidden transition-colors ${otrasError ? 'border-negative' : 'border-border focus-within:border-brand'}`}>
              <input id="pref-otras" type="text" inputMode="numeric" value={otrasDraft ?? String(otras)} maxLength={2}
                aria-invalid={!!otrasError} aria-describedby={otrasError ? 'pref-otras-error' : undefined}
                onChange={e => { setOtrasDraft(e.target.value); setOtrasError(null) }}
                onBlur={commitOtras} onKeyDown={blurOnEnter}
                className="px-3 py-2 text-sm mono bg-transparent text-fg w-16 text-right focus:outline-hidden" />
              <span className="px-3 py-2 text-sm text-fg-subtle border-l border-border bg-background-secondary">%</span>
            </div>
            {otrasError && (
              <p id="pref-otras-error" role="alert" className="text-xs text-negative-ink flex items-center justify-end gap-1">
                <AlertCircle size={11} aria-hidden="true" /> {otrasError}. Se mantiene el {otras} %.
              </p>
            )}
          </div>
        </Row>

        <Row label="Columnas de Posiciones"
          hint="Qué columnas muestra la tabla de Portfolio, además de activo y valor. Resultado total e ingresos solo se ven en la vista por activo sin filtro de wallet.">
          <ColumnasSelector values={columnas} className="w-44"
            onChange={cols => {
              const previous = serializarColumnas(portfolioColumnas(current()))
              const next = serializarColumnas(cols)
              if (next === previous) return
              void save(PORTFOLIO_COLUMNAS_KEY, next, `Tabla de posiciones con ${cols.length} ${cols.length === 1 ? 'columna' : 'columnas'} opcionales`, previous)
            }} />
        </Row>

        <Row label="Marcas del gráfico de un activo"
          hint="Cómo se señalan las compras y ventas en el gráfico de precio del detalle de un activo en Portfolio: puntos sobre la línea o banderas arriba o abajo, sin tapar la línea.">
          <Dropdown label="Marcas del gráfico de un activo" value={marcas} className="w-44"
            options={MARCAS_OPCIONES.map(o => ({ value: o.value, label: o.label }))}
            onChange={v => {
              const previous = marcasGrafico(current())
              if (v === previous) return
              void save(GRAFICO_MARCAS_KEY, v, `Operaciones del gráfico marcadas con ${marcasLabel(v as MarcasGrafico).toLowerCase()}`, previous)
            }} />
        </Row>

        <Row label="Densidad del Historial"
          hint="Altura de las filas de la tabla del Historial: cómoda o compacta, para ver más operaciones a la vez.">
          <SegmentedControl label="Densidad del Historial" value={densidad}
            options={DENSIDAD_OPCIONES.map(o => ({ value: o.value, label: o.label }))}
            onChange={v => {
              const previous = densidadHistorial(current())
              if (v === previous) return
              void save(HISTORIAL_DENSIDAD_KEY, v, `Historial con densidad ${v === 'compacta' ? 'compacta' : 'cómoda'}`, previous)
            }} />
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
