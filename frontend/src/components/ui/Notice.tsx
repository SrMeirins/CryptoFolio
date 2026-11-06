import type { ReactNode } from 'react'
import { AlertTriangle, Info, Lightbulb, type LucideIcon } from 'lucide-react'
import { NOTICE_LABEL, noticeClasses, noticeIconClasses, type NoticeTipo } from './classes'

// Aviso común (#493). Norma de la base común:
// - aviso: algo requiere atención (datos incompletos, plazos, cambios).
// - consejo: una acción recomendada que mejora el resultado.
// - información: contexto que ayuda a leer la pantalla.
// Icono, título opcional (solo si el texto ocupa varias líneas o es una lista),
// texto y acción opcional. Nunca solo color: el icono y el tipo leído por el
// lector de pantalla dicen lo mismo que el tono. Los errores de una acción no
// son avisos: siguen la norma de errores y confirmaciones (#497).

const ICONS: Record<NoticeTipo, LucideIcon> = { aviso: AlertTriangle, consejo: Lightbulb, informacion: Info }

export function Notice({ tipo, title, titleAs: Title = 'p', children, action, icon, compact = false, role, className = '' }: {
  tipo: NoticeTipo
  title?: ReactNode
  /** Encabezado del título cuando el aviso abre una sección propia (p. ej. una lista de avisos). */
  titleAs?: 'p' | 'h2' | 'h3'
  children: ReactNode
  /** Botón o enlace relacionado; en pantallas estrechas baja bajo el texto. */
  action?: ReactNode
  /** Icono más concreto que el del tipo (p. ej. un reloj para un plazo). */
  icon?: LucideIcon
  compact?: boolean
  /** `status` solo si el aviso aparece o cambia sin que el usuario lo pida. */
  role?: 'status' | 'alert'
  className?: string
}) {
  const Icon = icon ?? ICONS[tipo]
  return (
    <div role={role} data-notice={tipo} className={noticeClasses(tipo, compact, className)}>
      <Icon size={14} aria-hidden="true" className={noticeIconClasses(tipo)} />
      <div className="flex-1 min-w-[12rem] space-y-1 leading-relaxed">
        {title && <Title className="text-[13px] font-semibold text-fg"><span className="sr-only">{NOTICE_LABEL[tipo]}: </span>{title}</Title>}
        <div className="text-fg-muted">
          {!title && <span className="sr-only">{NOTICE_LABEL[tipo]}: </span>}
          {children}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2 self-center">{action}</div>}
    </div>
  )
}
