import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, ArrowLeftRight, Coins, Receipt, Settings,
  ChevronRight, ChevronLeft, ChevronDown, Info, AlertCircle, CheckCircle, X, Zap,
} from 'lucide-react'
import { portfolioApi, type OperationType, type CatalogData } from '../api/portfolio'
import { DynamicField } from './DynamicField'
import { WalletLabel } from './WalletPicker'
import { buildInitialFields } from '../utils/operationWizardFields'
import { T } from '../utils/colors'
import { buttonClasses, iconButtonClasses } from './ui'

interface OperationWizardProps {
  unknownOperation?: {
    originalLabel: string; timestamp: string; asset: string; amount: number
    rawData?: Record<string, unknown>
  }
  initialValues?: { operationTypeId: string; fields: Record<string, unknown> }
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
  ACQUISITION: T.positive,
  DISPOSITION: T.negative,
  MOVEMENT:    T.brand,
  INCOME:      T.purple,
  FEE:         T.info,
  SPECIAL:     T.muted,
}

const BADGE_COLORS: Record<string, string> = {
  green: 'bg-positive/10 text-positive',
  red:   'bg-negative/10  text-negative',
  blue:  'bg-brand/10 text-brand',
  gray:  'bg-overlay/50    text-fg-muted',
  amber: 'bg-warning/10 text-warning',
}

const CATEGORIES_ORDER = ['ACQUISITION', 'DISPOSITION', 'INCOME', 'MOVEMENT', 'FEE', 'SPECIAL']

// ── Componente principal ───────────────────────────────────────────────────
// Espera al catálogo y monta el formulario solo cuando está disponible.
export function OperationWizard(props: OperationWizardProps) {
  const { data: catalog } = useQuery({ queryKey: ['operation-catalog'], queryFn: portfolioApi.getCatalog })

  if (!catalog) {
    return (
      <div className="flex items-center justify-center h-64 text-fg-subtle text-sm">
        Cargando catálogo...
      </div>
    )
  }
  return <OperationWizardForm {...props} catalog={catalog} />
}

function OperationWizardForm({ catalog, unknownOperation, initialValues, onComplete, onCancel }: OperationWizardProps & { catalog: CatalogData }) {
  // Modo edición: tipo y campos precargados desde initialValues.
  const initialType = initialValues
    ? catalog.operations.find(op => op.id === initialValues.operationTypeId) ?? null
    : null
  const [step, setStep]                 = useState<'type' | 'fields' | 'confirm'>(initialType ? 'fields' : 'type')
  const [selectedType, setSelectedType] = useState<OperationType | null>(initialType)
  const [expandedCat, setExpandedCat]   = useState<string | null>('ACQUISITION')
  const [fieldValues, setFieldValues]   = useState<Record<string, unknown>>(
    () => buildInitialFields(initialType && initialValues ? initialValues.fields : {}, unknownOperation),
  )
  const [showHelper, setShowHelper]     = useState(false)
  const [applyToAll, setApplyToAll]     = useState(false)
  const [autoPrice, setAutoPrice]       = useState<number | null>(null)
  const [autoPriceLoading, setAutoPriceLoading] = useState(false)

  // Al cambiar de paso, si el usuario vació la fecha, vuelve a "ahora"
  // (salvo que la operación venga de un CSV, que ya trae su propia fecha).
  function goToStep(next: 'type' | 'fields' | 'confirm') {
    setStep(next)
    if (!fieldValues.timestamp && !unknownOperation) {
      setFieldValues(prev => ({ ...prev, timestamp: new Date().toISOString() }))
    }
  }

  // Auto-precio en tiempo real. Deps sin fieldValues.price_eur a propósito:
  // el guard `if (fieldValues.price_eur) return` ya cubre no pisar un precio
  // que el usuario haya escrito a mano, sin necesidad de re-disparar el
  // efecto cada vez que ese campo cambia.
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
        const { price_eur } = await portfolioApi.getHistoricalPrice(asset, dateStr)
        setAutoPrice(price_eur > 0 ? price_eur : null)
      } catch { setAutoPrice(null) }
      finally { setAutoPriceLoading(false) }
    }, 800)
    return () => clearTimeout(debounce)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues.asset, fieldValues.timestamp, selectedType])

  function handleFieldChange(name: string, value: unknown) {
    setFieldValues(prev => ({ ...prev, [name]: value }))
    if (name === 'price_eur') setAutoPrice(null)
  }

  function handleSelectType(op: OperationType) {
    setSelectedType(op)
    setAutoPrice(null)
    goToStep('fields')
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
            {unknownOperation ? 'Catalogar operación' : initialValues ? 'Editar transacción' : 'Nueva transacción'}
          </h2>
          {unknownOperation && (
            <p className="text-xs text-fg-subtle mt-0.5">
              Original: <span className="text-warning mono">{unknownOperation.originalLabel}</span>
              {' · '}{unknownOperation.asset} {unknownOperation.amount}
              {' · '}{new Date(unknownOperation.timestamp).toLocaleDateString('es-ES')}
            </p>
          )}
        </div>
        <button type="button" onClick={onCancel} aria-label="Cerrar" className={iconButtonClasses('sm')}>
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
              {i > 0 && <ChevronRight size={11} className="text-fg-subtle" />}
              <div className={`flex items-center gap-1.5 text-xs font-medium ${
                idx === cur ? 'text-brand' : idx < cur ? 'text-positive' : 'text-fg-subtle'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  idx === cur ? 'bg-brand-solid text-on-brand' :
                  idx < cur  ? 'bg-positive text-on-positive' : 'bg-background-tertiary text-fg-subtle'
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
            <p className="text-xs text-fg-subtle px-1 pb-2">
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
                    type="button"
                    onClick={() => setExpandedCat(isOpen ? null : catKey)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-background-tertiary hover:bg-border/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color }} className="opacity-80">{CATEGORY_ICONS[catKey]}</span>
                      <span className="text-sm font-medium text-fg">{meta.label}</span>
                      <span className="text-xs text-fg-subtle">{meta.description}</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-fg-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Tipos dentro de la categoría */}
                  {isOpen && (
                    <div className="divide-y divide-border/40">
                      {ops.map(op => (
                        <button
                          type="button"
                          key={op.id}
                          onClick={() => handleSelectType(op)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-background-tertiary/60 transition-colors text-left group"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-fg group-hover:text-fg">
                                {op.label}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${BADGE_COLORS[op.badgeColor]}`}>
                                {op.badge}
                              </span>
                            </div>
                            <p className="text-xs text-fg-subtle">{op.description}</p>
                          </div>
                          <ChevronRight size={13} className="text-fg-subtle group-hover:text-brand shrink-0 ml-3" />
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
              type="button"
              onClick={() => setShowHelper(!showHelper)}
              className="flex items-center gap-2 text-xs text-brand hover:text-brand/80 transition-colors mb-4"
            >
              <Info size={12} />
              {showHelper ? 'Ocultar ayuda fiscal' : 'Ver ayuda y tratamiento fiscal'}
            </button>

            {showHelper && (
              <div className="mb-5 space-y-2">
                <div className="bg-background-tertiary rounded-xl p-4 text-xs space-y-2">
                  <div className="font-medium text-fg">{selectedType.label}</div>
                  <p className="text-fg-muted leading-relaxed">{selectedType.helper}</p>
                  {selectedType.example && (
                    <div className="text-fg-subtle italic border-l-2 border-border pl-3">
                      {selectedType.example}
                    </div>
                  )}
                </div>
                <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 text-xs">
                  <div className="flex items-center gap-1.5 text-warning font-medium mb-2">
                    <AlertCircle size={12} />
                    Tratamiento fiscal — España IRPF
                  </div>
                  <p className="text-fg-muted leading-relaxed">{selectedType.fiscalHelper}</p>
                </div>
              </div>
            )}

            {/* Precio auto */}
            {(autoPrice || autoPriceLoading) && (
              <div className="mb-4 flex items-center gap-2 p-2.5 bg-brand/5 border border-brand/20 rounded-lg text-xs">
                <Zap size={11} className="text-brand shrink-0" />
                {autoPriceLoading
                  ? <span className="text-fg-muted">Consultando precio histórico...</span>
                  : <span className="text-fg-muted">
                      Precio detectado: <span className="text-fg font-medium mono">{autoPrice?.toFixed(6)} EUR</span>
                      <span className="text-fg-subtle ml-1">(se usará automáticamente)</span>
                    </span>
                }
              </div>
            )}

            {/* Advertencia fecha futura */}
            {isFutureDate && (
              <div className="mb-4 flex items-center gap-2 p-2.5 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning">
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
                  className="w-4 h-4 rounded-lg accent-accent-blue"
                />
                <label htmlFor="applyToAll" className="text-xs text-fg-muted">
                  Aplicar a todas las operaciones del tipo{' '}
                  <span className="text-warning mono">{unknownOperation.originalLabel}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 3: Confirmar ── */}
        {step === 'confirm' && selectedType && (
          <div className="p-5 space-y-4">
            <div className="bg-background-tertiary rounded-xl p-5 space-y-3">
              <h3 className="font-medium text-sm text-fg">Resumen de la operación</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Tipo</span>
                  <span className="font-medium text-fg">{selectedType.label}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-fg-subtle">Efecto fiscal</span>
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
                      <span className="text-fg-subtle">{f.label}</span>
                      <span className="mono text-fg text-xs">
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
                    <span className="text-fg-subtle flex items-center gap-1">
                      Precio EUR <Zap size={9} className="text-brand" />
                    </span>
                    <span className="mono text-brand text-xs">{autoPrice.toFixed(6)} (auto)</span>
                  </div>
                )}
              </div>
            </div>

            {selectedType.fiscalTreatment !== 'NO_TAXABLE_EVENT' && (
              <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning">
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
          type="button"
          onClick={() => {
            if (step === 'type')    onCancel()
            if (step === 'fields')  goToStep('type')
            if (step === 'confirm') goToStep('fields')
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ChevronLeft size={14} />
          {step === 'type' ? 'Cancelar' : 'Atrás'}
        </button>

        {step === 'fields' && (
          <button
            type="button"
            onClick={() => goToStep('confirm')}
            disabled={!isFormValid()}
            className={buttonClasses('primary', 'lg', 'flex')}
          >
            Continuar
            <ChevronRight size={14} />
          </button>
        )}

        {step === 'confirm' && (
          <button
            type="button"
            onClick={handleComplete}
            className={buttonClasses('success', 'lg', 'flex')}
          >
            <CheckCircle size={14} />
            Confirmar operación
          </button>
        )}
      </div>
    </div>
  )
}
