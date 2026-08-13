import type { IndividualNode, TreeRelationship } from '../api'

export const CARD_W = 200
export const CARD_H = 108
export const GAP_X = 44
export const GAP_Y = 156
export const SPOUSE_GAP = 18
export const PAD = 48
const UNIT = CARD_W + GAP_X

export interface LaidOutNode extends IndividualNode {
  x: number
  y: number
  generation: number
}

function hasName(n: IndividualNode): boolean {
  const first = n.firstName?.trim().toLowerCase()
  const last = n.lastName?.trim().toLowerCase()
  return Boolean(
    (first && first !== 'unknown') || (last && last !== 'unknown'),
  )
}

function pushUnique(
  map: Map<string, string[]>,
  key: string,
  value: string,
): void {
  if (!map.has(key)) map.set(key, [])
  const list = map.get(key)!
  if (!list.includes(value)) list.push(value)
}

function areSpouses(
  a: string,
  b: string,
  spousesOf: Map<string, string[]>,
): boolean {
  return (spousesOf.get(a) ?? []).includes(b)
}

function minStep(
  leftId: string,
  rightId: string,
  spousesOf: Map<string, string[]>,
): number {
  return areSpouses(leftId, rightId, spousesOf)
    ? CARD_W + SPOUSE_GAP
    : UNIT
}

/**
 * Layered genealogy layout:
 * 1) generation from parent→child only
 * 2) orphan spouses adopt partner generation (display only)
 * 3) barycenter ordering to keep parents near children
 * 4) spouses placed side-by-side; tighter gap between spouses
 */
export function layoutNodes(
  nodes: IndividualNode[],
  relationships: TreeRelationship[],
  preferredRoot?: string | null,
): LaidOutNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (nodes.length === 0) return []

  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  const spousesOf = new Map<string, string[]>()

  for (const rel of relationships) {
    if (rel.type === 'PARENT_CHILD') {
      pushUnique(parentsOf, rel.target, rel.source)
      pushUnique(childrenOf, rel.source, rel.target)
    } else if (rel.type === 'SPOUSE') {
      pushUnique(spousesOf, rel.source, rel.target)
      pushUnique(spousesOf, rel.target, rel.source)
    }
  }

  const generation = new Map<string, number>()
  const depthOf = (id: string, stack: Set<string>): number => {
    if (generation.has(id)) return generation.get(id)!
    if (stack.has(id)) return 0
    stack.add(id)
    const pars = parentsOf.get(id) ?? []
    const g =
      pars.length === 0
        ? 0
        : Math.max(...pars.map((p) => depthOf(p, stack))) + 1
    stack.delete(id)
    generation.set(id, g)
    return g
  }
  for (const n of nodes) depthOf(n.id, new Set())

  for (const [id, spouses] of spousesOf) {
    if ((parentsOf.get(id) ?? []).length > 0) continue
    let best: number | undefined
    for (const s of spouses) {
      const g = generation.get(s)
      if (g == null) continue
      best = best == null ? g : Math.min(best, g)
    }
    if (best != null) generation.set(id, best)
  }

  const byGen = new Map<number, string[]>()
  for (const [id, g] of generation) {
    if (!byId.has(id)) continue
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g)!.push(id)
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b)

  const order = new Map<string, number>()
  const seed = preferredRoot && byId.has(preferredRoot) ? preferredRoot : null

  for (const g of gens) {
    const ids = byGen.get(g)!.slice().sort((a, b) => {
      if (a === seed) return -1
      if (b === seed) return 1
      const na = hasName(byId.get(a)!) ? 0 : 1
      const nb = hasName(byId.get(b)!) ? 0 : 1
      if (na !== nb) return na - nb
      return a.localeCompare(b)
    })
    ids.forEach((id, i) => order.set(id, i))
    byGen.set(g, ids)
  }

  const barycenter = (ids: string[], neighbors: (id: string) => string[]) => {
    const scored = ids.map((id) => {
      const ns = neighbors(id).filter((n) => order.has(n))
      if (ns.length === 0) return { id, score: order.get(id) ?? 0 }
      const avg = ns.reduce((s, n) => s + (order.get(n) ?? 0), 0) / ns.length
      return { id, score: avg }
    })
    scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    return scored.map((s) => s.id)
  }

  for (let pass = 0; pass < 8; pass++) {
    for (let gi = 1; gi < gens.length; gi++) {
      const g = gens[gi]
      const ids = barycenter(byGen.get(g)!, (id) => parentsOf.get(id) ?? [])
      byGen.set(g, ids)
      ids.forEach((id, i) => order.set(id, i))
    }
    for (let gi = gens.length - 2; gi >= 0; gi--) {
      const g = gens[gi]
      const ids = barycenter(byGen.get(g)!, (id) => childrenOf.get(id) ?? [])
      byGen.set(g, ids)
      ids.forEach((id, i) => order.set(id, i))
    }
  }

  for (const g of gens) {
    const ids = byGen.get(g)!
    const placed = new Set<string>()
    const next: string[] = []
    for (const id of ids) {
      if (placed.has(id)) continue
      next.push(id)
      placed.add(id)
      for (const s of spousesOf.get(id) ?? []) {
        if (generation.get(s) !== g || placed.has(s)) continue
        next.push(s)
        placed.add(s)
      }
    }
    byGen.set(g, next)
    next.forEach((id, i) => order.set(id, i))
  }

  const xPos = new Map<string, number>()
  const densest = gens.reduce((a, b) =>
    (byGen.get(a)?.length ?? 0) >= (byGen.get(b)?.length ?? 0) ? a : b,
  )

  const packLayer = (ids: string[]): string[] => {
    const ordered = ids
      .slice()
      .sort(
        (a, b) =>
          (xPos.get(a) ?? 0) - (xPos.get(b) ?? 0) || a.localeCompare(b),
      )
    let prevX = -Infinity
    let prevId: string | null = null
    for (const id of ordered) {
      let x = xPos.get(id) ?? PAD
      if (prevId != null) {
        const minX = prevX + minStep(prevId, id, spousesOf)
        if (x < minX) x = minX
      } else if (x < PAD) {
        x = PAD
      }
      xPos.set(id, x)
      prevX = x
      prevId = id
    }
    return ordered
  }

  {
    const densestIds = byGen.get(densest)!
    densestIds.forEach((id, i) => xPos.set(id, PAD + i * UNIT))
    byGen.set(densest, packLayer(densestIds))
  }

  const placeByRefs = (
    g: number,
    ids: string[],
    refsOf: (id: string) => string[],
  ): void => {
    const assigned: Array<{ id: string; x: number }> = []
    const floating: string[] = []

    for (const id of ids) {
      const refs = refsOf(id).filter((r) => xPos.has(r))
      if (refs.length === 0) {
        floating.push(id)
        continue
      }
      const x = refs.reduce((s, r) => s + xPos.get(r)!, 0) / refs.length
      assigned.push({ id, x })
    }

    assigned.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    let cursor = PAD
    let prevId: string | null = null
    for (const item of assigned) {
      const placed = prevId
        ? Math.max(cursor + minStep(prevId, item.id, spousesOf), item.x)
        : Math.max(PAD, item.x)
      xPos.set(item.id, placed)
      cursor = placed
      prevId = item.id
    }
    for (const id of floating) {
      const placed = prevId
        ? cursor + minStep(prevId, id, spousesOf)
        : Math.max(PAD, cursor)
      xPos.set(id, placed)
      cursor = placed
      prevId = id
    }

    byGen.set(g, packLayer(ids))
  }

  for (const g of gens) {
    if (g === densest) continue
    if (g > densest) {
      placeByRefs(g, byGen.get(g)!, (id) => parentsOf.get(id) ?? [])
    }
  }
  for (let i = gens.indexOf(densest) - 1; i >= 0; i--) {
    const g = gens[i]
    placeByRefs(g, byGen.get(g)!, (id) => childrenOf.get(id) ?? [])
  }

  byGen.set(densest, packLayer(byGen.get(densest)!))
  let minX = Infinity
  for (const x of xPos.values()) minX = Math.min(minX, x)
  const shift = PAD - minX
  if (shift !== 0) {
    for (const [id, x] of xPos) xPos.set(id, x + shift)
  }

  const laid: LaidOutNode[] = []
  for (const g of gens) {
    for (const id of byGen.get(g)!) {
      const node = byId.get(id)!
      laid.push({
        ...node,
        generation: g,
        x: xPos.get(id) ?? PAD,
        y: PAD + g * GAP_Y,
      })
    }
  }
  return laid
}

/** Orthogonal parent→child and side-to-side spouse edges. */
export function edgePath(
  a: LaidOutNode,
  b: LaidOutNode,
  type: string,
): string {
  if (type === 'SPOUSE') {
    const left = a.x <= b.x ? a : b
    const right = a.x <= b.x ? b : a
    const y = (left.y + right.y) / 2 + CARD_H / 2
    return `M ${left.x + CARD_W} ${y} L ${right.x} ${y}`
  }
  const x1 = a.x + CARD_W / 2
  const x2 = b.x + CARD_W / 2
  const midY = (a.y + CARD_H + b.y) / 2
  return `M ${x1} ${a.y + CARD_H} V ${midY} H ${x2} V ${b.y}`
}

export function meaningfulNamePart(value?: string): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return ''
  return trimmed
}

export function cardNameLines(n: IndividualNode): {
  primary: string
  secondary: string
} {
  const last = meaningfulNamePart(n.lastName)
  const first = [meaningfulNamePart(n.firstName), meaningfulNamePart(n.middleName)]
    .filter(Boolean)
    .join(' ')
  if (last) return { primary: last, secondary: first }
  if (first) return { primary: first, secondary: '' }
  return { primary: 'Без имени', secondary: '' }
}

export function yearOf(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 4)
  return String(d.getFullYear())
}

export function personMatchesQuery(
  n: Pick<IndividualNode, 'firstName' | 'lastName' | 'middleName'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const hay = [n.firstName, n.middleName, n.lastName]
    .map((p) => meaningfulNamePart(p).toLowerCase())
    .filter(Boolean)
    .join(' ')
  return hay.includes(q)
}
