import { useState, useEffect, useRef } from 'react'
import {
  TrendingUp, TrendingDown, ArrowLeftRight, Coins, Receipt, Settings,
  ChevronRight, ChevronLeft, Info, AlertCircle, CheckCircle, X, Zap,
  ChevronDown,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface WalletOption { id: string; name: string; type: string; color: string; is_system: boolean }

function useWallets() {
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const fetched = useRef(false)
  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    fetch('/api/wallets').then(r => r.json()).then(setWallets).catch(() => {})
  }, [])
  return wallets
}

interface FieldDefinition {
  name: string
  label: string
  required: boolean
  auto?: boolean
  type: 'asset' | 'number' | 'wallet' | 'datetime' | 'text' | 'select'
  placeholder?: string
  hint?: string
  options?: { value: string; label: string }[]
}

interface OperationType {
  id: string
  category: string
  label: string
  description: string
  helper: string
  fiscalHelper: string
  fiscalTreatment: string
  fifoEffect: string
  fields: FieldDefinition[]
  example?: string
  badge: string
  badgeColor: 'green' | 'red' | 'blue' | 'gray' | 'amber'
}

interface CategoryMeta { label: string; description: string; icon: string }

interface CatalogData {
  categories: Record<string, CategoryMeta>
  operations: OperationType[]
}

interface OperationWizardProps {
  unknownOperation?: {
    originalLabel: string; timestamp: string; asset: string; amount: number
    rawData?: Record<string, unknown>
  }
  onComplete: (result: WizardResult) => void
  onCancel: () => void
}

export interface WizardResult {
  operationTypeId: string
  fields: Record<string, unknown>
  applyToAll?: boolean
}

// ── Constantes visuales ────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ACQUISITION:  <TrendingUp   size={14} />,
  DISPOSITION:  <TrendingDown size={14} />,
  MOVEMENT:     <ArrowLeftRight size={14} />,
  INCOME:       <Coins        size={14} />,
  FEE:          <Receipt      size={14} />,
  SPECIAL:      <Settings     size={14} />,
}

const CATEGORY_COLORS: Record<string, string> = {
  ACQUISITION: '#00c896',
  DISPOSITION: '#e74c3c',
  MOVEMENT:    '#6366f1',
  INCOME:      '#8b5cf6',
  FEE:         '#3b82f6',
  SPECIAL:     '#6b7280',
}

const BADGE_COLORS: Record<string, string> = {
  green: 'bg-accent-green/10 text-accent-green',
  red:   'bg-accent-red/10  text-accent-red',
  blue:  'bg-accent-blue/10 text-accent-blue',
  gray:  'bg-gray-700/50    text-gray-400',
  amber: 'bg-accent-amber/10 text-accent-amber',
}

const CATEGORIES_ORDER = ['ACQUISITION', 'DISPOSITION', 'INCOME', 'MOVEMENT', 'FEE', 'SPECIAL']

// ── Componente principal ───────────────────────────────────────────────────
export function OperationWizard({ unknownOperation, onComplete, onCancel }: OperationWizardProps) {
  const [catalog, setCatalog]           = useState<CatalogData | null>(null)
  const [step, setStep]                 = useState<'type' | 'fields' | 'confirm'>('type')
  const [selectedType, setSelectedType] = useState<OperationType | null>(null)
  const [expandedCat, setExpandedCat]   = useState<string | null>('ACQUISITION')
  const [fieldValues, setFieldValues]   = useState<Record<string, unknown>>({})
  const [showHelper, setShowHelper]     = useState(false)
  const [applyToAll, setApplyToAll]     = useState(false)
  const [autoPrice, setAutoPrice]       = useState<number | null>(null)
  const [autoPriceLoading, setAutoPriceLoading] = useState(false)

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(setCatalog).catch(() => {})
  }, [])

  useEffect(() => {
    if (unknownOperation) {
      setFieldValues(prev => ({
        ...prev,
        timestamp: unknownOperation.timestamp,
        asset:     unknownOperation.asset,
        amount:    unknownOperation.amount,
      }))
    }
  }, [unknownOperation])

  // Default timestamp a "ahora" si no viene prefijado
  useEffect(() => {
    if (!fieldValues.timestamp && !unknownOperation) {
      setFieldValues(prev => ({
        ...prev,
        timestamp: new Date().toISOString(),
      }))
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-precio en tiempo real
  useEffect(() => {
    if (!selectedType) return
    const asset     = fieldValues.asset as string
    const timestamp = fieldValues.timestamp as string
    if (!asset || !timestamp) return

    const hasPriceAuto = selectedType.fields.some(f => f.name === 'price_eur' && f.auto)
    if (!hasPriceAuto) return
    if (fieldValues.price_eur) return

    const debounce = setTimeout(async () => {
      setAutoPriceLoading(true)
      try {
        const dateStr = new Date(timestamp).toISOString().slice(0, 10)
        const res = await fetch(`/api/prices/historical?asset=${asset}&date=${dateStr}`)
        if (res.ok) {
          const data = await res.json()
          setAutoPrice(data.price_eur > 0 ? data.price_eur : null)
        }
      } catch { setAutoPrice(null) }
      finally { setAutoPriceLoading(false) }
    }, 800)
    return () => clearTimeout(debounce)
  }, [fieldValues.asset, fieldValues.timestamp, selectedType]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!catalog) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Cargando catálogo...
      </div>
    )
  }

  function handleFieldChange(name: string, value: unknown) {
    setFieldValues(prev => ({ ...prev, [name]: value }))
    if (name === 'price_eur') setAutoPrice(null)
  }

  function handleSelectType(op: OperationType) {
    setSelectedType(op)
    setAutoPrice(null)
    setStep('fields')
  }

  function handleComplete() {
    if (!selectedType) return
    const finalFields = { ...fieldValues }
    if (autoPrice && !finalFields.price_eur) finalFields.price_eur = autoPrice
    onComplete({ operationTypeId: selectedType.id, fields: finalFields, applyToAll })
  }

  function isFormValid() {
    if (!selectedType) return false
    return selectedType.fields.filter(f => f.required).every(f => {
      const val = fieldValues[f.name]
      return val !== undefined && val !== null && val !== ''
    })
  }

  const isFutureDate = fieldValues.timestamp
    ? new Date(fieldValues.timestamp as string) > new Date()
    : false

  return (
    <div className="flex flex-col h-full max-h-[85vh]">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="font-semibold text-lg">
            {unknownOperation ? 'Catalogar operación' : 'Nueva transacción'}
          </h2>
          {unknownOperation && (
            <p className="text-xs text-gray-500 mt-0.5">
              Original: <span className="text-accent-amber font-mono">{unknownOperation.originalLabel}</span>
              {' · '}{unknownOperation.asset} {unknownOperation.amount}
              {' · '}{new Date(unknownOperation.timestamp).toLocaleDateString('es-ES')}
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0 bg-background-primary/50">
        {([
          { key: 'type',    label: 'Tipo' },
          { key: 'fields',  label: 'Detalles' },
          { key: 'confirm', label: 'Confirmar' },
        ] as const).map((s, i) => {
          const steps = ['type', 'fields', 'confirm'] as const
          const cur = steps.indexOf(step)
          const idx = steps.indexOf(s.key)
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={11} className="text-gray-700" />}
              <div className={`flex items-center gap-1.5 text-xs font-medium ${
                idx === cur ? 'text-accent-blue' : idx < cur ? 'text-accent-green' : 'text-gray-600'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  idx === cur ? 'bg-accent-blue text-white' :
                  idx < cur  ? 'bg-accent-green text-white' : 'bg-background-tertiary text-gray-500'
                }`}>
                  {idx < cur ? <CheckCircle size={11} /> : i + 1}
                </div>
                {s.label}
              </div>
            </div>
          )
        })}
        {selectedType && step !== 'type' && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_COLORS[selectedType.badgeColor]}`}>
            {selectedType.label}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── PASO 1: Tipo (todos agrupados por categoría) ── */}
        {step === 'type' && (
          <div className="p-4 space-y-1.5">
            <p className="text-xs text-gray-500 px-1 pb-2">
              Selecciona el tipo de operación que quieres registrar
            </p>
            {CATEGORIES_ORDER.map(catKey => {
              const meta = catalog.categories[catKey]
              if (!meta) return null
              const ops = catalog.operations.filter(op => op.category === catKey)
              if (ops.length === 0) return null
              const isOpen = expandedCat === catKey
              const color  = CATEGORY_COLORS[catKey]

              return (
                <div key={catKey} className="rounded-xl border border-border overflow-hidden">
                  {/* Cabecera categoría */}
                  <button
                    onClick={() => setExpandedCat(isOpen ? null : catKey)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-background-tertiary hover:bg-border/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color }} className="opacity-80">{CATEGORY_ICONS[catKey]}</span>
                      <span className="text-sm font-medium text-gray-200">{meta.label}</span>
                      <span className="text-xs text-gray-600">{meta.description}</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Tipos dentro de la categoría */}
                  {isOpen && (
                    <div className="divide-y divide-border/40">
                      {ops.map(op => (
                        <button
                          key={op.id}
                          onClick={() => handleSelectType(op)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-background-tertiary/60 transition-colors text-left group"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-gray-200 group-hover:text-white">
                                {op.label}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BADGE_COLORS[op.badgeColor]}`}>
                                {op.badge}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{op.description}</p>
                          </div>
                          <ChevronRight size={13} className="text-gray-600 group-hover:text-accent-blue shrink-0 ml-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── PASO 2: Campos ── */}
        {step === 'fields' && selectedType && (
          <div className="p-5">
            {/* Helper toggle */}
            <button
              onClick={() => setShowHelper(!showHelper)}
              className="flex items-center gap-2 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors mb-4"
            >
              <Info size={12} />
              {showHelper ? 'Ocultar ayuda fiscal' : 'Ver ayuda y tratamiento fiscal'}
            </button>

            {showHelper && (
              <div className="mb-5 space-y-2">
                <div className="bg-background-tertiary rounded-xl p-4 text-xs space-y-2">
                  <div className="font-medium text-white">{selectedType.label}</div>
                  <p className="text-gray-400 leading-relaxed">{selectedType.helper}</p>
                  {selectedType.example && (
                    <div className="text-gray-500 italic border-l-2 border-border pl-3">
                      {selectedType.example}
                    </div>
                  )}
                </div>
                <div className="bg-accent-amber/5 border border-accent-amber/20 rounded-xl p-4 text-xs">
                  <div className="flex items-center gap-1.5 text-accent-amber font-medium mb-2">
                    <AlertCircle size={12} />
                    Tratamiento fiscal — España IRPF
                  </div>
                  <p className="text-gray-400 leading-relaxed">{selectedType.fiscalHelper}</p>
                </div>
              </div>
            )}

            {/* Precio auto */}
            {(autoPrice || autoPriceLoading) && (
              <div className="mb-4 flex items-center gap-2 p-2.5 bg-accent-blue/5 border border-accent-blue/20 rounded-lg text-xs">
                <Zap size={11} className="text-accent-blue shrink-0" />
                {autoPriceLoading
                  ? <span className="text-gray-400">Consultando precio histórico...</span>
                  : <span className="text-gray-400">
                      Precio detectado: <span className="text-white font-medium mono">{autoPrice?.toFixed(6)} EUR</span>
                      <span className="text-gray-600 ml-1">(se usará automáticamente)</span>
                    </span>
                }
              </div>
            )}

            {/* Advertencia fecha futura */}
            {isFutureDate && (
              <div className="mb-4 flex items-center gap-2 p-2.5 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
                <AlertCircle size={11} className="shrink-0" />
                La fecha introducida es futura. Verifica que sea correcta.
              </div>
            )}

            {/* Formulario dinámico */}
            <div className="space-y-3.5">
              {selectedType.fields.map(field => (
                <DynamicField
                  key={field.name}
                  field={field}
                  value={fieldValues[field.name]}
                  onChange={val => handleFieldChange(field.name, val)}
                />
              ))}
            </div>

            {/* Apply to all (solo ops desconocidas) */}
            {unknownOperation && (
              <div className="mt-5 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="applyToAll"
                  checked={applyToAll}
                  onChange={e => setApplyToAll(e.target.checked)}
                  className="w-4 h-4 rounded accent-accent-blue"
                />
                <label htmlFor="applyToAll" className="text-xs text-gray-400">
                  Aplicar a todas las operaciones del tipo{' '}
                  <span className="text-accent-amber font-mono">{unknownOperation.originalLabel}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 3: Confirmar ── */}
        {step === 'confirm' && selectedType && (
          <div className="p-5 space-y-4">
            <div className="bg-background-tertiary rounded-xl p-5 space-y-3">
              <h3 className="font-medium text-sm text-gray-300">Resumen de la operación</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className="font-medium text-white">{selectedType.label}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Efecto fiscal</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_COLORS[selectedType.badgeColor]}`}>
                    {selectedType.badge}
                  </span>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                {selectedType.fields
                  .filter(f => fieldValues[f.name] !== undefined && fieldValues[f.name] !== '' && fieldValues[f.name] !== null)
                  .map(f => (
                    <div key={f.name} className="flex justify-between text-sm">
                      <span className="text-gray-500">{f.label}</span>
                      <span className="mono text-gray-200 text-xs">
                        {f.type === 'wallet'
                          ? <WalletLabel walletId={fieldValues[f.name] as string} />
                          : f.type === 'datetime'
                          ? new Date(fieldValues[f.name] as string).toLocaleString('es-ES')
                          : String(fieldValues[f.name])
                        }
                      </span>
                    </div>
                  ))
                }
                {autoPrice && !fieldValues.price_eur && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1">
                      Precio EUR <Zap size={9} className="text-accent-blue" />
                    </span>
                    <span className="mono text-accent-blue text-xs">{autoPrice.toFixed(6)} (auto)</span>
                  </div>
                )}
              </div>
            </div>

            {selectedType.fiscalTreatment !== 'NO_TAXABLE_EVENT' && (
              <div className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                Esta operación generará un evento fiscal. Verifica los datos antes de confirmar.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-border shrink-0">
        <button
          onClick={() => {
            if (step === 'type')    onCancel()
            if (step === 'fields')  setStep('type')
            if (step === 'confirm') setStep('fields')
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} />
          {step === 'type' ? 'Cancelar' : 'Atrás'}
        </button>

        {step === 'fields' && (
          <button
            onClick={() => setStep('confirm')}
            disabled={!isFormValid()}
            className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            Continuar
            <ChevronRight size={14} />
          </button>
        )}

        {step === 'confirm' && (
          <button
            onClick={handleComplete}
            className="flex items-center gap-2 px-5 py-2 bg-accent-green hover:bg-accent-green/80 rounded-lg text-sm font-medium transition-colors"
          >
            <CheckCircle size={14} />
            Confirmar operación
          </button>
        )}
      </div>
    </div>
  )
}

// ── WalletLabel helper ─────────────────────────────────────────────────────
function WalletLabel({ walletId }: { walletId: string }) {
  const [name, setName] = useState<string>(walletId)
  useEffect(() => {
    fetch('/api/wallets').then(r => r.json()).then((ws: WalletOption[]) => {
      const w = ws.find(w => w.id === walletId)
      if (w) setName(w.name)
    }).catch(() => {})
  }, [walletId])
  return <>{name}</>
}

// ── DynamicField ───────────────────────────────────────────────────────────
function DynamicField({
  field, value, onChange,
}: {
  field: FieldDefinition; value: unknown; onChange: (val: unknown) => void
}) {
  const baseInput = 'w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors'
  const wallets = useWallets()

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        {field.label}
        {field.required
          ? <span className="text-accent-red text-[10px]">requerido</span>
          : field.auto
          ? <span className="flex items-center gap-0.5 text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded text-[10px]">
              <Zap size={8} /> auto
            </span>
          : <span className="text-gray-700 text-[10px]">opcional</span>
        }
      </label>

      {field.type === 'number' && (
        <input
          type="number" step="any"
          placeholder={field.placeholder ?? '0'}
          value={(value as number) ?? ''}
          onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
          className={baseInput}
        />
      )}

      {field.type === 'text' && (
        <input
          type="text"
          placeholder={field.placeholder ?? ''}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        />
      )}

      {field.type === 'datetime' && (
        <input
          type="datetime-local"
          value={value ? new Date(value as string).toISOString().slice(0, 16) : ''}
          onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
          className={`${baseInput} [color-scheme:dark]`}
        />
      )}

      {field.type === 'asset' && (
        <input
          type="text"
          placeholder={field.placeholder ?? 'BTC, ETH, XRP...'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className={`${baseInput} font-mono uppercase tracking-wider`}
        />
      )}

      {field.type === 'wallet' && (
        <WalletPicker wallets={wallets} value={value as string} onChange={onChange} />
      )}

      {field.type === 'select' && field.options && (
        <select
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">Seleccionar...</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field.hint && <p className="text-[11px] text-gray-600 leading-tight">{field.hint}</p>}
    </div>
  )
}

// ── WalletPicker ─ selector rico con colores y tipo ────────────────────────
function WalletPicker({
  wallets, value, onChange,
}: {
  wallets: WalletOption[]; value: string; onChange: (val: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = wallets.find(w => w.id === value)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const typeLabel: Record<string, string> = { exchange: 'Exchange', cold: 'Frío', hot: 'Caliente', other: 'Otro' }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm hover:border-accent-blue/50 transition-colors text-left"
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="text-white truncate">{selected.name}</span>
            <span className="text-xs text-gray-600 shrink-0">{typeLabel[selected.type] ?? selected.type}</span>
          </div>
        ) : (
          <span className="text-gray-600">Seleccionar wallet...</span>
        )}
        <ChevronDown size={13} className={`text-gray-500 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background-card border border-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {wallets.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">Sin wallets configuradas</div>
          ) : (
            wallets.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => { onChange(w.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-background-tertiary transition-colors text-left ${w.id === value ? 'bg-background-tertiary' : ''}`}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="text-sm text-gray-200 flex-1">{w.name}</span>
                <span className="text-[10px] text-gray-600">{typeLabel[w.type] ?? w.type}</span>
                {w.id === value && <CheckCircle size={11} className="text-accent-green shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
