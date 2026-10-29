// Novedades de la versión (#447): el Markdown de la sección del CHANGELOG en
// bloques simples para pintarlos como texto, sin HTML (nada se inyecta).

export interface ChangelogBlock { heading: string; items: string[] }

/** Quita el formato en línea de Markdown: negritas, cursivas, código y enlaces. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

/** Bloques por encabezado (### o ####) con sus puntos de lista. */
export function changelogBlocks(md: string): ChangelogBlock[] {
  const blocks: ChangelogBlock[] = []
  let current: ChangelogBlock | null = null
  for (const line of md.split('\n')) {
    const heading = line.match(/^#{3,4}\s+(.*)$/)
    if (heading) {
      current = { heading: plainText(heading[1]), items: [] }
      blocks.push(current)
      continue
    }
    const item = line.match(/^\s*-\s+(.*)$/)
    if (item) {
      if (!current) { current = { heading: '', items: [] }; blocks.push(current) }
      current.items.push(plainText(item[1]))
    }
  }
  return blocks.filter(b => b.items.length > 0)
}
