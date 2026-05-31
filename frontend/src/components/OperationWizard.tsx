import { useState, useEffect, useRef } from 'react'
import {
  TrendingUp, TrendingDown, ArrowLeftRight, Coins, Receipt, Settings,
  ChevronRight, ChevronLeft, Info, AlertCircle, CheckCircle, X, Zap
} from 'lucide-react'

interface WalletOption { id: string; name: string; type: string }

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

interface CategoryMeta {
  label: string
  description: string
  icon: string
}

interface CatalogData {
  categories: Record<string, CategoryMeta>
  operations: OperationType[]
}

interface OperationWizardProps {
  unknownOperation?: {
    originalLabel: string
    timestamp: string
    asset: string
    amount: number
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

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ACQUISITION:  <TrendingUp size={20} />,
  DISPOSITION:  <TrendingDown size={20} />,
  MOVEMENT:     <ArrowLeftRight size={20} />,
  INCOME:       <Coins size={20} />,
  FEE:          <Receipt size={20} />,
  SPECIAL:      <Settings size={20} />,
}

const BADGE_COLORS: Record<string, string> = {
  green: 'bg-accent-green/10 text-accent-green',
  red:   'bg-accent-red/10 text-accent-red',
  blue:  'bg-accent-blue/10 text-accent-blue',
  gray:  'bg-gray-700/50 text-gray-400',
  amber: 'bg-accent-amber/10 text-accent-amber',
}

export function OperationWizard({ unknownOperation, onComplete, onCancel }: OperationWizardProps) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [step, setStep] = useState<'category' | 'type' | 'fields' | 'confirm'>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<OperationType | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [showHelper, setShowHelper] = useState(false)
  const [applyToAll, setApplyToAll] = useState(false)
  const [autoPrice, setAutoPrice] = useState<number | null>(null)
  const [autoPriceLoading, setAutoPriceLoading] = useState(false)

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(setCatalog)
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (unknownOperation) {
      setFieldValues(prev => ({
        ...prev,
        timestamp: unknownOperation.timestamp,
        asset: unknownOperation.asset,
        amount: unknownOperation.amount,
      }))
    }
  }, [unknownOperation])

  // Auto-precio en tiempo real cuando cambia asset o timestamp
  useEffect(() => {
    if (!selectedType) return

    const asset = fieldValues.asset as string
    const timestamp = fieldValues.timestamp as string

    if (!asset || !timestamp) return

    // Solo si el tipo tiene campos auto de precio
    const hasPriceAuto = selectedType.fields.some(f => f.name === 'price_eur' && f.auto)
    if (!hasPriceAuto) return

    // Si el usuario ya introdujo precio manualmente, no sobreescribir
    if (fieldValues.price_eur) return

    const debounce = setTimeout(async () => {
      setAutoPriceLoading(true)
      try {
        const dateStr = new Date(timestamp).toISOString().slice(0, 10)
        const res = await fetch(`/api/prices/historical?asset=${asset}&date=${dateStr}`)
        if (res.ok) {
          const data = await res.json()
          if (data.price_eur > 0) {
            setAutoPrice(data.price_eur)
          } else {
            setAutoPrice(null)
          }
        }
      } catch {
        setAutoPrice(null)
      } finally {
        setAutoPriceLoading(false)
      }
    }, 800)

    return () => clearTimeout(debounce)
  }, [fieldValues.asset, fieldValues.timestamp, selectedType])

  if (!catalog) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm">Cargando catalogo...</div>
      </div>
    )
  }

  const categoriesInOrder = ['ACQUISITION', 'DISPOSITION', 'MOVEMENT', 'INCOME', 'FEE', 'SPECIAL']
  const typesInCategory = selectedCategory
    ? catalog.operations.filter(op => op.category === selectedCategory)
    : []

  function handleFieldChange(name: string, value: unknown) {
    setFieldValues(prev => ({ ...prev, [name]: value }))
    // Si el usuario cambia price_eur manualmente, limpiar el auto
    if (name === 'price_eur') setAutoPrice(null)
  }

  function handleComplete() {
    if (!selectedType) return
    // Incluir precio auto si no se introdujo manualmente
    const finalFields = { ...fieldValues }
    if (autoPrice && !finalFields.price_eur) {
      finalFields.price_eur = autoPrice
    }
    onComplete({
      operationTypeId: selectedType.id,
      fields: finalFields,
      applyToAll,
    })
  }

  function isFormValid() {
    if (!selectedType) return false
    return selectedType.fields
      .filter(f => f.required)
      .every(f => {
        const val = fieldValues[f.name]
        return val !== undefined && val !== null && val !== ''
      })
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="font-semibold text-lg">
            {unknownOperation ? 'Catalogar operacion' : 'Nueva transaccion'}
          </h2>
          {unknownOperation && (
            <p className="text-xs text-gray-500 mt-0.5">
              Operacion original: <span className="text-accent-amber font-mono">{unknownOperation.originalLabel}</span>
              {' · '}{unknownOperation.asset} {unknownOperation.amount}
              {' · '}{new Date(unknownOperation.timestamp).toLocaleDateString('es-ES')}
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0">
        {[
          { key: 'category', label: 'Categoria' },
          { key: 'type',     label: 'Tipo' },
          { key: 'fields',   label: 'Detalles' },
          { key: 'confirm',  label: 'Confirmar' },
        ].map((s, i) => {
          const steps = ['category', 'type', 'fields', 'confirm']
          const currentIdx = steps.indexOf(step)
          const thisIdx = steps.indexOf(s.key)
          const isDone = thisIdx < currentIdx
          const isCurrent = thisIdx === currentIdx

          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={12} className="text-gray-600" />}
              <div className={`flex items-center gap-1.5 text-xs font-medium ${
                isCurrent ? 'text-accent-blue' :
                isDone ? 'text-accent-green' : 'text-gray-600'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  isCurrent ? 'bg-accent-blue text-white' :
                  isDone ? 'bg-accent-green text-white' :
                  'bg-background-tertiary text-gray-500'
                }`}>
                  {isDone ? <CheckCircle size={12} /> : i + 1}
                </div>
                {s.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* PASO 1: Categoria */}
        {step === 'category' && (
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-400 mb-4">Selecciona la categoria que mejor describe esta operacion</p>
            <div className="grid grid-cols-2 gap-3">
              {categoriesInOrder.map(catKey => {
                const meta = catalog.categories[catKey]
                if (!meta) return null
                return (
                  <button
                    key={catKey}
                    onClick={() => {
                      setSelectedCategory(catKey)
                      setStep('type')
                    }}
                    className="flex items-start gap-3 p-4 bg-background-tertiary hover:bg-background-card border border-border hover:border-accent-blue/50 rounded-xl text-left transition-all group"
                  >
                    <div className="text-accent-blue mt-0.5 shrink-0">
                      {CATEGORY_ICONS[catKey]}
                    </div>
                    <div>
                      <div className="font-medium text-sm group-hover:text-white">{meta.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{meta.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* PASO 2: Tipo */}
        {step === 'type' && selectedCategory && (
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-400 mb-4">Selecciona el tipo especifico de operacion</p>
            <div className="space-y-2">
              {typesInCategory.map(opType => (
                <button
                  key={opType.id}
                  onClick={() => {
                    setSelectedType(opType)
                    setAutoPrice(null)
                    setStep('fields')
                  }}
                  className="w-full flex items-center justify-between p-4 bg-background-tertiary hover:bg-background-card border border-border hover:border-accent-blue/50 rounded-xl text-left transition-all group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm group-hover:text-white">{opType.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_COLORS[opType.badgeColor]}`}>
                        {opType.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{opType.description}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 group-hover:text-accent-blue shrink-0 ml-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 3: Campos */}
        {step === 'fields' && selectedType && (
          <div className="p-6">
            {/* Helper toggle */}
            <div className="mb-5">
              <button
                onClick={() => setShowHelper(!showHelper)}
                className="flex items-center gap-2 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
              >
                <Info size={13} />
                {showHelper ? 'Ocultar informacion' : 'Ver informacion y tratamiento fiscal'}
              </button>

              {showHelper && (
                <div className="mt-3 space-y-3">
                  <div className="bg-background-tertiary rounded-xl p-4 text-xs space-y-2">
                    <div className="font-medium text-white">{selectedType.label}</div>
                    <p className="text-gray-400 leading-relaxed">{selectedType.helper}</p>
                    {selectedType.example && (
                      <div className="text-gray-500 italic border-l-2 border-border pl-3">
                        Ejemplo: {selectedType.example}
                      </div>
                    )}
                  </div>
                  <div className="bg-accent-amber/5 border border-accent-amber/20 rounded-xl p-4 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-accent-amber font-medium mb-2">
                      <AlertCircle size={13} />
                      Tratamiento fiscal — Espana IRPF
                    </div>
                    <p className="text-gray-400 leading-relaxed">{selectedType.fiscalHelper}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Precio auto detectado */}
            {(autoPrice || autoPriceLoading) && (
              <div className="mb-4 flex items-center gap-2 p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-lg text-xs">
                <Zap size={12} className="text-accent-blue shrink-0" />
                {autoPriceLoading
                  ? <span className="text-gray-400">Consultando precio historico de Binance...</span>
                  : <span className="text-gray-400">
                      Precio historico detectado: <span className="text-white font-medium mono">{autoPrice?.toFixed(6)} EUR</span>
                      {' '}<span className="text-gray-600">(se usara automaticamente si no introduces precio manual)</span>
                    </span>
                }
              </div>
            )}

            {/* Formulario dinamico */}
            <div className="space-y-4">
              {selectedType.fields.map(field => (
                <DynamicField
                  key={field.name}
                  field={field}
                  value={fieldValues[field.name]}
                  onChange={(val) => handleFieldChange(field.name, val)}
                />
              ))}
            </div>

            {/* Apply to all (solo para ops desconocidas) */}
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
                  Aplicar esta catalogacion a todas las operaciones del tipo <span className="text-accent-amber font-mono">{unknownOperation.originalLabel}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* PASO 4: Confirmar */}
        {step === 'confirm' && selectedType && (
          <div className="p-6 space-y-4">
            <div className="bg-background-tertiary rounded-xl p-5 space-y-3">
              <h3 className="font-medium text-sm">Resumen de la operacion</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className="font-medium">{selectedType.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Efecto fiscal</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE_COLORS[selectedType.badgeColor]}`}>
                    {selectedType.badge}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Efecto FIFO</span>
                  <span className="mono text-xs text-gray-300">{selectedType.fifoEffect}</span>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                {selectedType.fields
                  .filter(f => fieldValues[f.name] !== undefined && fieldValues[f.name] !== '')
                  .map(f => (
                    <div key={f.name} className="flex justify-between text-sm">
                      <span className="text-gray-500">{f.label}</span>
                      <span className="mono text-gray-300">{String(fieldValues[f.name])}</span>
                    </div>
                  ))
                }
                {autoPrice && !fieldValues.price_eur && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1">
                      Precio EUR <Zap size={10} className="text-accent-blue" />
                    </span>
                    <span className="mono text-accent-blue">{autoPrice.toFixed(6)} (auto)</span>
                  </div>
                )}
              </div>
            </div>

            {selectedType.fiscalTreatment !== 'NO_TAXABLE_EVENT' && (
              <div className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                Esta operacion generara un evento fiscal. Verifica los datos antes de confirmar.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
        <button
          onClick={() => {
            if (step === 'category') onCancel()
            if (step === 'type') setStep('category')
            if (step === 'fields') setStep('type')
            if (step === 'confirm') setStep('fields')
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} />
          {step === 'category' ? 'Cancelar' : 'Atras'}
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
            Confirmar operacion
          </button>
        )}
      </div>
    </div>
  )
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition
  value: unknown
  onChange: (val: unknown) => void
}) {
  const baseInput = 'w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors'
  const wallets = useWallets()

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        {field.label}
        {field.required
          ? <span className="text-accent-red">*</span>
          : field.auto
          ? <span className="flex items-center gap-0.5 text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded text-xs">
              <Zap size={9} />
              auto
            </span>
          : <span className="text-gray-700 text-xs">opcional</span>
        }
      </label>

      {field.type === 'number' && (
        <input
          type="number"
          step="any"
          placeholder={field.placeholder ?? '0'}
          value={value as number ?? ''}
          onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
          className={baseInput}
        />
      )}

      {field.type === 'text' && (
        <input
          type="text"
          placeholder={field.placeholder ?? ''}
          value={value as string ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        />
      )}

      {field.type === 'datetime' && (
        <input
          type="datetime-local"
          value={value ? new Date(value as string).toISOString().slice(0, 16) : ''}
          onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
          className={baseInput}
        />
      )}

      {field.type === 'asset' && (
        <input
          type="text"
          placeholder={field.placeholder ?? 'BTC, ETH, XRP...'}
          value={value as string ?? ''}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className={`${baseInput} font-mono uppercase`}
        />
      )}

      {field.type === 'wallet' && (
        <select
          value={value as string ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">Seleccionar wallet...</option>
          {wallets.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      )}

      {field.type === 'select' && field.options && (
        <select
          value={value as string ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">Seleccionar...</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field.hint && (
        <p className="text-xs text-gray-600">{field.hint}</p>
      )}
    </div>
  )
}