import { useMemo } from 'react'
import type { IndividualNode, TreeRelationship } from '../api'
import './TreeCanvas.css'

interface Props {
  nodes: IndividualNode[]
  relationships: TreeRelationship[]
  rootId?: string | null
}

interface LaidOutNode extends IndividualNode {
  x: number
  y: number
  generation: number
}

const CARD_W = 168
const CARD_H = 88
const GAP_X = 36
const GAP_Y = 130
const PAD = 48
const UNIT = CARD_W + GAP_X

function displayName(n: IndividualNode): string {
  const first = n.firstName?.trim()
  const last = n.lastName?.trim()
  const parts = [first, n.middleName?.trim(), last].filter(
    (p) => p && p.toLowerCase() !== 'unknown',
  )
  if (parts.length) return parts.join(' ')
  return 'Без имени'
}

function yearOf(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 4)
  return String(d.getFullYear())
}

function hasName(n: IndividualNode): boolean {
  const first = n.firstName?.trim().toLowerCase()
  const last = n.lastName?.trim().toLowerCase()
  return Boolean(
    (first && first !== 'unknown') || (last && last !== 'unknown'),
  )
}

/**
 * Layered genealogy layout:
 * 1) generation from parent→child only
 * 2) orphan spouses adopt partner generation (display only)
 * 3) barycenter ordering to keep parents near children
 * 4) spouses placed side-by-side within a layer
 */
function layoutNodes(
  nodes: IndividualNode[],
  relationships: TreeRelationship[],
  preferredRoot?: string | null,
): LaidOutNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (nodes.length === 0) return []

  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  const spousesOf = new Map<string, string[]>()

  const pushUnique = (map: Map<string, string[]>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, [])
    const list = map.get(key)!
    if (!list.includes(value)) list.push(value)
  }

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

  // Spouses without their own parents sit on the partner's generation.
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

  // Initial order: prefer named people, keep preferred root early.
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

  // Iterate barycenters down then up to reduce crossings.
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

  // Pull spouses next to each other within each layer.
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

  // X positions: start from densest generation, propagate parent midpoints downward.
  const xPos = new Map<string, number>()
  const densest = gens.reduce((a, b) =>
    (byGen.get(a)?.length ?? 0) >= (byGen.get(b)?.length ?? 0) ? a : b,
  )
  const densestIds = byGen.get(densest)!
  densestIds.forEach((id, i) => xPos.set(id, PAD + i * UNIT))

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
    for (const item of assigned) {
      const x = Math.max(cursor, item.x)
      xPos.set(item.id, x)
      cursor = x + UNIT
    }
    for (const id of floating) {
      xPos.set(id, cursor)
      cursor += UNIT
    }

    // Resolve overlaps while preserving order.
    const ordered = ids
      .slice()
      .sort(
        (a, b) =>
          (xPos.get(a) ?? 0) - (xPos.get(b) ?? 0) || a.localeCompare(b),
      )
    let prev = -Infinity
    for (const id of ordered) {
      let x = xPos.get(id) ?? PAD
      if (x < prev + UNIT) x = prev + UNIT
      xPos.set(id, x)
      prev = x
    }
    byGen.set(g, ordered)
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

  // Ensure densest layer also has no gaps after spouse clustering.
  {
    const ids = byGen.get(densest)!
    let prev = -Infinity
    const ordered = ids
      .slice()
      .sort(
        (a, b) =>
          (xPos.get(a) ?? 0) - (xPos.get(b) ?? 0) || a.localeCompare(b),
      )
    for (const id of ordered) {
      let x = xPos.get(id) ?? PAD
      if (x < prev + UNIT) x = prev + UNIT
      xPos.set(id, x)
      prev = x
    }
    byGen.set(densest, ordered)
  }

  // Normalize so min x = PAD.
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

function edgePath(
  a: LaidOutNode,
  b: LaidOutNode,
  type: string,
): string {
  const x1 = a.x + CARD_W / 2
  const y1 = a.y + CARD_H / 2
  const x2 = b.x + CARD_W / 2
  const y2 = b.y + CARD_H / 2
  if (type === 'SPOUSE') {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  const midY = (a.y + CARD_H + b.y) / 2
  return `M ${x1} ${a.y + CARD_H} V ${midY} H ${x2} V ${b.y}`
}

export function TreeCanvas({ nodes, relationships, rootId }: Props) {
  const laid = useMemo(
    () => layoutNodes(nodes, relationships, rootId),
    [nodes, relationships, rootId],
  )

  const pos = useMemo(() => {
    const m = new Map<string, LaidOutNode>()
    for (const n of laid) m.set(n.id, n)
    return m
  }, [laid])

  const width = Math.max(900, ...laid.map((n) => n.x + CARD_W + PAD), 100)
  const height = Math.max(420, ...laid.map((n) => n.y + CARD_H + PAD), 100)

  const edges = relationships.filter(
    (rel) => pos.has(rel.source) && pos.has(rel.target),
  )

  return (
    <div className="tree-scroll">
      <svg
        className="tree-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Семейное древо"
      >
        {edges.map((rel, i) => {
          const a = pos.get(rel.source)!
          const b = pos.get(rel.target)!
          return (
            <path
              key={`${rel.type}-${rel.source}-${rel.target}-${i}`}
              d={edgePath(a, b, rel.type)}
              className={
                rel.type === 'SPOUSE' ? 'tree-edge spouse' : 'tree-edge'
              }
              fill="none"
            />
          )
        })}

        {laid.map((n) => {
          const years = [yearOf(n.birthDate), yearOf(n.deathDate)]
            .filter(Boolean)
            .join(' – ')
          return (
            <foreignObject
              key={n.id}
              x={n.x}
              y={n.y}
              width={CARD_W}
              height={CARD_H}
              className="tree-fo"
            >
              <div
                className={`tree-node ${n.id === rootId ? 'is-root' : ''}`}
                title={n.id}
              >
                <strong>{displayName(n)}</strong>
                <span>{years || '—'}</span>
              </div>
            </foreignObject>
          )
        })}
      </svg>
    </div>
  )
}
