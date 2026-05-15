import { useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, ArrowLeftRight, Coins, Receipt, Settings,
  ChevronRight, ChevronLeft, Info, AlertCircle, CheckCircle, X
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface FieldDefinition {
  name: string
  label: string
  required: boolean
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
  // Si viene de catalogación de op desconocida
  unknownOperation?: {
    originalLabel: string
    timestamp: string
    asset: string
    amount: number
    rawData?: Record<string, unknown>
  }
  // Si es entrada manual
  onComplete: (result: WizardResult) => void
  onCancel: () => void
}

export interface WizardResult {
  operationTypeId: string
  fields: Record<string, unknown>
  applyToAll?: boolean // Para ops desconocidas repetidas
}

// ── Iconos por categoría ───────────────────────────────────────────────────
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

// ── Componente principal ───────────────────────────────────────────────────
export function OperationWizard({ unknownOperation, onComplete, onCancel }: OperationWizardProps) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [step, setStep] = useState<'category' | 'type' | 'fields' | 'confirm'>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<OperationType | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [showHelper, setShowHelper] = useState(false)
  const [applyToAll, setApplyToAll] = useState(false)

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(setCatalog)
      .catch(console.error)
  }, [])

  // Pre-rellenar campos si viene de op desconocida
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

  if (!catalog) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm">Cargando catálogo...</div>
      </div>
    )
  }

  const categoriesInOrder = ['ACQUISITION', 'DISPOSITION', 'MOVEMENT', 'INCOME', 'FEE', 'SPECIAL']
  const typesInCategory = selectedCategory
    ? catalog.operations.filter(op => op.category === selectedCategory)
    : []

  function handleFieldChange(name: string, value: unknown) {
    setFieldValues(prev => ({ ...prev, [name]: value }))
  }

  function handleComplete() {
    if (!selectedType) return
    onComplete({
      operationTypeId: selectedType.id,
      fields: fieldValues,
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
            {unknownOperation ? 'Catalogar operación' : 'Nueva transacción'}
          </h2>
          {unknownOperation && (
            <p className="text-xs text-gray-500 mt-0.5">
              Operación original: <span className="text-accent-amber font-mono">{unknownOperation.originalLabel}</span>
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
          { key: 'category', label: 'Categoría' },
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

        {/* PASO 1: Categoría */}
        {step === 'category' && (
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-400 mb-4">Selecciona la categoría que mejor describe esta operación</p>
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
            <p className="text-sm text-gray-400 mb-4">
              Selecciona el tipo específico de operación
            </p>
            <div className="space-y-2">
              {typesInCategory.map(opType => (
                <button
                  key={opType.id}
                  onClick={() => {
                    setSelectedType(opType)
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
                {showHelper ? 'Ocultar información' : 'Ver información y tratamiento fiscal'}
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
                      Tratamiento fiscal — España IRPF
                    </div>
                    <p className="text-gray-400 leading-relaxed">{selectedType.fiscalHelper}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Formulario dinámico */}
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
                  Aplicar esta catalogación a todas las operaciones del mismo tipo <span className="text-accent-amber font-mono">{unknownOperation.originalLabel}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* PASO 4: Confirmar */}
        {step === 'confirm' && selectedType && (
          <div className="p-6 space-y-4">
            <div className="bg-background-tertiary rounded-xl p-5 space-y-3">
              <h3 className="font-medium text-sm">Resumen de la operación</h3>

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
              </div>
            </div>

            {/* Warning si genera evento fiscal */}
            {selectedType.fiscalTreatment !== 'NO_TAXABLE_EVENT' && (
              <div className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg text-xs text-accent-amber">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                Esta operación generará un evento fiscal. Verifica los datos antes de confirmar.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer con navegación */}
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
          {step === 'category' ? 'Cancelar' : 'Atrás'}
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

// ── Campo dinámico ─────────────────────────────────────────────────────────
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

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-xs font-medium text-gray-400">
        {field.label}
        {field.required && <span className="text-accent-red">*</span>}
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
          className={`${baseInput} mono uppercase`}
        />
      )}

      {field.type === 'wallet' && (
        <select
          value={value as string ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">Seleccionar wallet...</option>
          <option value="BINANCE">Binance</option>
          <option value="TANGEM">Tangem</option>
          <option value="MANUAL">Otra (manual)</option>
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
