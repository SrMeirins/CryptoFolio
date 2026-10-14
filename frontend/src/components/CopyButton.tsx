import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Botón de copiar al portapapeles con feedback visual breve (check 1.5s). */
export function CopyButton({ text, size = 11, title = 'Copiar', className = '' }: {
  text: string; size?: number; title?: string; className?: string
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={title}
      title={title}
      className={`text-fg-subtle hover:text-fg-muted transition-colors inline-flex items-center shrink-0 ${className}`}
    >
      {copied ? <Check size={size} className="text-positive" /> : <Copy size={size} />}
    </button>
  )
}
