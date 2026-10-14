import { T, alpha, ink } from '../../utils/colors'
export function AccountChip({ account, colors }: { account: string; colors: Record<string, string> }) {
  const color = colors[account] ?? T.muted
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-lg font-medium"
      style={{ backgroundColor: `${alpha(color, 9)}`, color: ink(color) }}
    >
      {account}
    </span>
  )
}
