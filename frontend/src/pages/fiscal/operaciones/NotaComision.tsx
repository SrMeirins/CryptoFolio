import { ReceiptText } from 'lucide-react'
import { formatEur } from '../../../utils/format'
import { Tooltip } from '../../../components/ui'
import { CANALES, canalDePermuta, EPS_COMISION, textoComision, textoNota, type ConComision } from './textoComision'

// Canal y comisión de una permuta en la tabla de Operaciones (#543). Solo
// informativos: el cálculo no cambia.

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
// El canal, con contorno para distinguirlo del tipo (relleno de color).
const CHIP_CANAL = `px-1.5 py-px rounded-md text-[11px] whitespace-nowrap border border-border text-fg-muted ${FOCO}`
const CHIP_COMISION = `px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-overlay/8 text-fg-muted ${FOCO}`
const ICONO = `inline-flex size-5 items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/10 ${FOCO}`

/** «Orden», «Convert», «Saldos a BNB» o «Liquidación», en las permutas. */
export function ChipCanal({ op }: { op: ConComision }) {
  const canal = canalDePermuta(op)
  if (!canal) return null
  const c = CANALES[canal]
  return <Tooltip label={c.titulo} triggerLabel={c.texto} triggerClassName={CHIP_CANAL} trigger={c.corto}>{c.texto}</Tooltip>
}

/** «Comisión 0,42 €» de una compra, al coste de lo recibido. */
export function ChipComision({ op }: { op: ConComision }) {
  const texto = textoComision(op)
  const c = op.comisionCompraEur ?? 0
  if (!texto || c < EPS_COMISION) return null
  return <Tooltip label="Comisión de la compra" triggerLabel={texto} triggerClassName={CHIP_COMISION} trigger={`Comisión ${formatEur(c)}`}>{texto}</Tooltip>
}

/** Densidad compacta: un icono con el canal y la comisión en el tooltip. */
export function IconoNota({ op }: { op: ConComision }) {
  const texto = textoNota(op)
  if (!texto) return null
  return (
    <Tooltip label="Canal y comisión" triggerLabel={texto} triggerClassName={ICONO}
      trigger={<ReceiptText size={13} aria-hidden="true" />}>
      {texto}
    </Tooltip>
  )
}
