import { useId, useState } from 'react'
import { ListPlus } from 'lucide-react'
import type { VentaPlanGuardada } from '../../../api/portfolio'
import { buttonClasses, Dropdown, fieldClasses, Modal, ModalBody, ModalFooter, ModalHeader } from '../../../components/ui'
import { formatEur, formatNumber } from '../../../utils/format'
import { cantidadEnCampo, parseCantidad, type saldos } from '../../../utils/planVentas'

// Venta libre del plan (#546): cualquier activo y wallet con saldo, la
// cantidad (con «Máx») y, si se quiere, un precio propio; sin él, el en vivo.

type Saldos = ReturnType<typeof saldos>

export function VentaLibreDialog({ disponibles, prices, onAdd, onClose }: {
  disponibles: Saldos
  prices: Readonly<Record<string, number>>
  onAdd: (v: VentaPlanGuardada) => void
  onClose: () => void
}) {
  const titleId = useId()
  const uid = useId()
  const [asset, setAsset] = useState(disponibles[0]?.asset ?? '')
  const activo = disponibles.find(d => d.asset === asset)
  const [walletId, setWalletId] = useState(activo?.wallets[0]?.id ?? '')
  const wallet = activo?.wallets.find(w => w.id === walletId)
  const [cantidadTxt, setCantidadTxt] = useState('')
  const [precioTxt, setPrecioTxt] = useState('')
  const cantidad = parseCantidad(cantidadTxt)
  const precio = precioTxt.trim() ? parseCantidad(precioTxt) : null
  const vivo = prices[asset]
  const cantidadValida = Number.isFinite(cantidad) && cantidad > 0
  const precioValido = precio === null || (Number.isFinite(precio) && precio > 0)
  const valido = !!wallet && cantidadValida && precioValido

  function elegirActivo(a: string) {
    setAsset(a)
    setWalletId(disponibles.find(d => d.asset === a)?.wallets[0]?.id ?? '')
    setCantidadTxt('')
  }

  function anadir() {
    if (!valido || !wallet) return
    onAdd({ asset, walletId: wallet.id, walletNombre: wallet.nombre, cantidad, precioEur: precio })
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader titleId={titleId} title="Añadir otra venta al plan" icon={<ListPlus size={16} aria-hidden="true" />} onClose={onClose} />
      <ModalBody className="space-y-3 text-sm">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="block text-xs text-fg-muted" aria-hidden="true">Activo</span>
            <Dropdown label="Activo" value={asset} searchable onChange={elegirActivo}
              options={disponibles.map(d => ({ value: d.asset, label: d.asset, description: `${formatNumber(d.total, 8)} en total` }))} />
          </div>
          <div className="space-y-1">
            <span className="block text-xs text-fg-muted" aria-hidden="true">Wallet</span>
            <Dropdown label="Wallet" value={walletId} onChange={setWalletId}
              options={(activo?.wallets ?? []).map(w => ({ value: w.id, label: w.nombre, description: `${formatNumber(w.cantidad, 8)} ${asset}` }))} />
          </div>
        </div>
        <label className="block space-y-1">
          <span className="block text-xs text-fg-muted">Cantidad</span>
          <span className="flex items-center gap-2">
            <input type="text" inputMode="decimal" value={cantidadTxt} onChange={e => setCantidadTxt(e.target.value)} maxLength={24}
              aria-invalid={cantidadTxt !== '' && !cantidadValida} aria-describedby={`${uid}-max`} className={fieldClasses('md', false, 'w-44 mono text-right')} />
            <button type="button" onClick={() => wallet && setCantidadTxt(cantidadEnCampo(wallet.cantidad))} className={buttonClasses('ghost', 'sm')}>Máx</button>
          </span>
          <span id={`${uid}-max`} className="block text-[11px] text-fg-subtle">
            {wallet ? `Tienes ${formatNumber(wallet.cantidad, 8)} ${asset} en ${wallet.nombre}.` : 'Elige una wallet.'}
          </span>
        </label>
        <label className="block space-y-1">
          <span className="block text-xs text-fg-muted">Precio por unidad (opcional)</span>
          <input type="text" inputMode="decimal" value={precioTxt} onChange={e => setPrecioTxt(e.target.value)} maxLength={24}
            placeholder={vivo ? formatEur(vivo) : ''} aria-invalid={!precioValido} aria-describedby={`${uid}-precio`}
            className={fieldClasses('md', false, 'w-44 mono text-right')} />
          <span id={`${uid}-precio`} className="block text-[11px] text-fg-subtle">Vacío: el precio en vivo{vivo ? `, ahora ${formatEur(vivo)}` : ''}. Pon uno si vas a vender con una orden límite.</span>
        </label>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
        <button type="button" onClick={anadir} disabled={!valido} className={buttonClasses('primary', 'sm')}>Añadir al plan</button>
      </ModalFooter>
    </Modal>
  )
}
