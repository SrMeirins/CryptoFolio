import { Plus, HardDrive, ArrowRight, X } from 'lucide-react'
import { cardClasses, buttonClasses, iconButtonClasses } from '../../components/ui'

export function SetupBanner({ onDismiss, onAddWallet }: { onDismiss: () => void; onAddWallet: () => void }) {
  return (
    <div className={cardClasses('md', 'border-brand/30 bg-brand/5')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-brand/10 rounded-lg shrink-0">
            <HardDrive size={20} className="text-brand" />
          </div>
          <div>
            <h3 className="font-medium text-sm">Configura tus wallets antes de importar</h3>
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">
              Si tienes wallets frías (Tangem, Ledger, Trezor...) añádelas aquí para que
              los retiros de Binance se asignen correctamente. Si solo operas en Binance
              no necesitas hacer nada más.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button type="button" onClick={onAddWallet}
                className={buttonClasses('primary', 'md', 'flex')}>
                <Plus size={14} /> Añadir wallet fría
              </button>
              <button type="button" onClick={onDismiss}
                className="flex items-center gap-2 px-4 py-2 text-sm text-fg-muted hover:text-fg transition-colors">
                Solo uso Binance <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Cerrar aviso"
          className={iconButtonClasses('sm', false, 'mt-0.5')}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
