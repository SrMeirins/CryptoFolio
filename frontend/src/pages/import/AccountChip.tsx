export function AccountChip({ account, colors }: { account: string; colors: Record<string, string> }) {
  const color = colors[account] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md font-medium"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {account}
    </span>
  )
}
