import type { IndividualNode, TreeRelationship } from '../api'

export const CARD_W = 200
export const CARD_H = 108
export const GAP_X = 44
export const GAP_Y = 156
export const SPOUSE_GAP = 18
export const PAD = 48
const UNIT = CARD_W + GAP_X

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

function byOriginalIndex(index: Map<string, number>) {
  return (a: string, b: string): number =>
    (index.get(a) ?? 0) - (index.get(b) ?? 0)
}

function linkedMembers(
  id: string,
  component: Set<string>,
  spousesOf: Map<string, string[]>,
  index: Map<string, number>,
): string[] {
  return (spousesOf.get(id) ?? [])
    .filter((spouseId) => component.has(spouseId))
    .sort(byOriginalIndex(index))
}

function firstUnvisitedLinked(
  id: string,
  component: Set<string>,
  spousesOf: Map<string, string[]>,
  index: Map<string, number>,
  visited: Set<string>,
): string | undefined {
  return linkedMembers(id, component, spousesOf, index).find(
    (spouseId) => !visited.has(spouseId),
  )
}

type ChainSide = 'left' | 'right'

function nextChainMember(
  chain: string[],
  component: Set<string>,
  spousesOf: Map<string, string[]>,
  index: Map<string, number>,
  visited: Set<string>,
): { id: string; side: ChainSide } | undefined {
  const left = chain[0]
  const right = chain[chain.length - 1]
  const firstSide: ChainSide = chain.length === 1 ? 'right' : 'left'
  const secondSide: ChainSide = chain.length === 1 ? 'left' : 'right'
  const firstId = firstSide === 'left' ? left : right
  const secondId = secondSide === 'left' ? left : right
  const first = firstUnvisitedLinked(firstId, component, spousesOf, index, visited)
  if (first != null) return { id: first, side: firstSide }
  const second = firstUnvisitedLinked(secondId, component, spousesOf, index, visited)
  if (second != null) return { id: second, side: secondSide }
  return undefined
}

function orderSpouseComponent(
  members: string[],
  spousesOf: Map<string, string[]>,
  index: Map<string, number>,
): string[] {
  const component = new Set(members)
  const seed = members.slice().sort(byOriginalIndex(index))[0]
  const chain = [seed]
  const visited = new Set(chain)

  while (visited.size < members.length) {
    const next = nextChainMember(chain, component, spousesOf, index, visited)
    if (next == null) {
      const remaining = members.filter((id) => !visited.has(id))
      remaining.sort(byOriginalIndex(index))
      chain.push(remaining[0])
      visited.add(remaining[0])
      continue
    }
    if (next.side === 'right') chain.push(next.id)
    else chain.unshift(next.id)
    visited.add(next.id)
  }

  return chain
}

/** Connected spouse components within `ids`, stable by first appearance. */
export function buildSpouseBlocks(
  ids: string[],
  spousesOf: Map<string, string[]>,
): string[][] {
  const inGen = new Set(ids)
  const index = new Map(ids.map((id, i) => [id, i]))
  const visited = new Set<string>()
  const blocks: string[][] = []

  for (const id of ids) {
    if (visited.has(id)) continue
    const block: string[] = []
    const queue = [id]
    visited.add(id)
    while (queue.length > 0) {
      const cur = queue.shift()!
      block.push(cur)
      for (const spouseId of spousesOf.get(cur) ?? []) {
        if (!inGen.has(spouseId) || visited.has(spouseId)) continue
        visited.add(spouseId)
        queue.push(spouseId)
      }
    }
    block.splice(0, block.length, ...orderSpouseComponent(block, spousesOf, index))
    blocks.push(block)
  }

  blocks.sort(
    (a, b) =>
      Math.min(...a.map((id) => index.get(id) ?? 0)) -
      Math.min(...b.map((id) => index.get(id) ?? 0)),
  )
  return blocks
}

export function orderIdsWithSpouseBlocks(
  ids: string[],
  spousesOf: Map<string, string[]>,
): string[] {
  return buildSpouseBlocks(ids, spousesOf).flat()
}

export function packBlocks(
  blocks: string[][],
  xHint: Map<string, number>,
  spousesOf: Map<string, string[]>,
): Map<string, number> {
  const scored = blocks.map((block) => {
    const hints = block
      .map((id) => xHint.get(id))
      .filter((x): x is number => x != null)
    const hint =
      hints.length === 0
        ? PAD
        : hints.reduce((sum, x) => sum + x, 0) / hints.length
    return { block, hint }
  })
  scored.sort((a, b) => a.hint - b.hint || a.block[0].localeCompare(b.block[0]))

  const xPos = new Map<string, number>()
  let cursor = PAD
  let prevId: string | null = null

  for (const { block, hint } of scored) {
    const widths: number[] = []
    for (let i = 0; i < block.length; i++) {
      if (i === 0) widths.push(0)
      else widths.push(minStep(block[i - 1], block[i], spousesOf))
    }
    const span = widths.reduce((sum, width) => sum + width, 0)
    let start = Math.max(cursor, hint - span / 2)
    if (prevId != null) {
      start = Math.max(start, cursor + minStep(prevId, block[0], spousesOf))
    } else {
      start = Math.max(PAD, start)
    }

    let x = start
    for (let i = 0; i < block.length; i++) {
      if (i > 0) x += minStep(block[i - 1], block[i], spousesOf)
      xPos.set(block[i], x)
    }
    cursor = x
    prevId = block[block.length - 1]
  }

  return xPos
}

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

/**
 * Display generations: spouse pairs share a row; children stay strictly below
 * every parent. Relaxes after the parent→child depth pass so uneven ancestry
 * (or orphan in-laws) cannot split couples or bury children under parents.
 */
function alignDisplayGenerations(
  nodeIds: Iterable<string>,
  parentsOf: Map<string, string[]>,
  spousesOf: Map<string, string[]>,
  generation: Map<string, number>,
): void {
  const ids = [...nodeIds]
  const maxPasses = Math.max(8, ids.length * 3)
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false

    for (const id of ids) {
      for (const spouseId of spousesOf.get(id) ?? []) {
        const ga = generation.get(id) ?? 0
        const gb = generation.get(spouseId) ?? 0
        const g = Math.max(ga, gb)
        if (ga !== g) {
          generation.set(id, g)
          changed = true
        }
        if (gb !== g) {
          generation.set(spouseId, g)
          changed = true
        }
      }
    }

    for (const id of ids) {
      const pars = parentsOf.get(id) ?? []
      if (pars.length === 0) continue
      const minGen =
        Math.max(...pars.map((p) => generation.get(p) ?? 0)) + 1
      const cur = generation.get(id) ?? 0
      if (cur < minGen) {
        generation.set(id, minGen)
        changed = true
      }
    }

    if (!changed) return
  }
}

/**
 * Layered genealogy layout:
 * 1) generation from parent→child only
 * 2) align spouses onto one row; push descendants below parents
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

  alignDisplayGenerations(
    byId.keys(),
    parentsOf,
    spousesOf,
    generation,
  )

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
    const ids = orderIdsWithSpouseBlocks(byGen.get(g)!, spousesOf)
    byGen.set(g, ids)
    ids.forEach((id, i) => order.set(id, i))
  }

  const xPos = new Map<string, number>()
  const densest = gens.reduce((a, b) =>
    (byGen.get(a)?.length ?? 0) >= (byGen.get(b)?.length ?? 0) ? a : b,
  )

  const packLayer = (ids: string[]): string[] => {
    const blocks = buildSpouseBlocks(ids, spousesOf)
    const packed = packBlocks(blocks, xPos, spousesOf)
    for (const [id, x] of packed) xPos.set(id, x)
    return blocks.flat()
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

export type FamilyComb = {
  familyId: string
  d: string
  memberIds: string[]
}

/**
 * Classic genealogy comb per family:
 * stem from parent mid (spouse gap or single parent) → horizontal bar → drops to children.
 */
export function buildFamilyCombs(
  relationships: TreeRelationship[],
  pos: Map<string, LaidOutNode>,
): FamilyComb[] {
  const byFamily = new Map<
    string,
    { parents: Set<string>; children: Set<string> }
  >()

  for (const rel of relationships) {
    if (!rel.familyId) continue
    if (!byFamily.has(rel.familyId)) {
      byFamily.set(rel.familyId, {
        parents: new Set(),
        children: new Set(),
      })
    }
    const fam = byFamily.get(rel.familyId)!
    if (rel.type === 'PARENT_CHILD') {
      fam.parents.add(rel.source)
      fam.children.add(rel.target)
    } else if (rel.type === 'SPOUSE') {
      fam.parents.add(rel.source)
      fam.parents.add(rel.target)
    }
  }

  const combs: FamilyComb[] = []

  for (const [familyId, fam] of byFamily) {
    const parents = [...fam.parents]
      .map((id) => pos.get(id))
      .filter((n): n is LaidOutNode => Boolean(n))
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    const children = [...fam.children]
      .map((id) => pos.get(id))
      .filter((n): n is LaidOutNode => Boolean(n))
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))

    if (parents.length === 0 || children.length === 0) continue

    const childXs = children.map((c) => c.x + CARD_W / 2)
    const parentBottom = Math.max(...parents.map((p) => p.y + CARD_H))
    const childTop = Math.min(...children.map((c) => c.y))
    if (childTop <= parentBottom + 8) continue

    const barY = parentBottom + (childTop - parentBottom) * 0.45

    let stemX: number
    let stemTopY: number
    if (parents.length >= 2) {
      const left = parents[0]
      const right = parents[parents.length - 1]
      stemX = (left.x + CARD_W + right.x) / 2
      stemTopY = (left.y + right.y) / 2 + CARD_H / 2
    } else {
      stemX = parents[0].x + CARD_W / 2
      stemTopY = parents[0].y + CARD_H
    }

    const barLeft = Math.min(stemX, ...childXs)
    const barRight = Math.max(stemX, ...childXs)

    const parts = [`M ${stemX} ${stemTopY} V ${barY}`]
    if (barRight - barLeft > 0.5) {
      parts.push(`M ${barLeft} ${barY} H ${barRight}`)
    }
    for (const cx of childXs) {
      parts.push(`M ${cx} ${barY} V ${childTop}`)
    }

    combs.push({
      familyId,
      d: parts.join(' '),
      memberIds: [
        ...new Set([
          ...parents.map((p) => p.id),
          ...children.map((c) => c.id),
        ]),
      ],
    })
  }

  return combs
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
