export function normalizeSurname(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase()
}

export function collectSurnames(
  nodes: Array<{ lastName?: string }>,
): string[] {
  const byKey = new Map<string, string>()
  for (const n of nodes) {
    const display = (n.lastName ?? '').trim()
    const key = normalizeSurname(display)
    if (!key || key === 'unknown') continue
    if (!byKey.has(key)) byKey.set(key, display)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'ru'))
}

export function isSurnameMismatch(
  lastName: string | undefined,
  selected: string | null,
): boolean {
  if (!selected || !normalizeSurname(selected)) return false
  return normalizeSurname(lastName) !== normalizeSurname(selected)
}

export function nodeHighlightFlags(args: {
  surnameMismatch: boolean
  focusActive: boolean
  inRelated: boolean
}): { isDim: boolean; isHot: boolean } {
  const { surnameMismatch, focusActive, inRelated } = args
  const isDim = surnameMismatch || (focusActive && !inRelated)
  const isHot = !surnameMismatch && focusActive && inRelated
  return { isDim, isHot }
}

export function edgeIsHot(
  sourceEmphasized: boolean,
  targetEmphasized: boolean,
  dimActive: boolean,
): boolean {
  if (!dimActive) return true
  return sourceEmphasized && targetEmphasized
}
