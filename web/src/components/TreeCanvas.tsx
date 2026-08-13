import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { IndividualNode, TreeRelationship } from '../api'
import { PersonAvatar } from './PersonAvatar'
import {
  CARD_H,
  CARD_W,
  PAD,
  cardNameLines,
  edgePath,
  layoutNodes,
  personMatchesQuery,
  yearOf,
  type LaidOutNode,
} from './treeLayout'
import './TreeCanvas.css'

interface Props {
  nodes: IndividualNode[]
  relationships: TreeRelationship[]
  rootId?: string | null
  selectedId?: string | null
  onSelect?: (id: string) => void
}

const MIN_SCALE = 0.35
const MAX_SCALE = 2.25
const ZOOM_STEP = 1.12

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function relatedIds(
  focusId: string | null | undefined,
  relationships: TreeRelationship[],
): Set<string> {
  const related = new Set<string>()
  if (!focusId) return related
  related.add(focusId)
  for (const rel of relationships) {
    if (rel.source === focusId) related.add(rel.target)
    if (rel.target === focusId) related.add(rel.source)
  }
  return related
}

export function TreeCanvas({
  nodes,
  relationships,
  rootId,
  selectedId,
  onSelect,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originTx: number
    originTy: number
  } | null>(null)
  const focusedSelection = useRef<string | null>(null)
  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 })

  useEffect(() => {
    transformRef.current = { scale, tx, ty }
  }, [scale, tx, ty])

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

  const focusId = hoverId ?? selectedId
  const hot = useMemo(
    () => relatedIds(focusId, relationships),
    [focusId, relationships],
  )
  const dimEdges = Boolean(focusId)

  const searchHits = useMemo(() => {
    const q = query.trim()
    if (!q) return [] as LaidOutNode[]
    return laid.filter((n) => personMatchesQuery(n, q)).slice(0, 8)
  }, [laid, query])

  function centerOn(node: LaidOutNode, nextScale = transformRef.current.scale) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const cx = node.x + CARD_W / 2
    const cy = node.y + CARD_H / 2
    setTx(rect.width / 2 - cx * nextScale)
    setTy(rect.height / 2 - cy * nextScale)
  }

  function zoomAt(clientX: number, clientY: number, nextScale: number) {
    const viewport = viewportRef.current
    const { scale: currentScale, tx: currentTx, ty: currentTy } =
      transformRef.current
    if (!viewport) {
      setScale(nextScale)
      return
    }
    const rect = viewport.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const worldX = (px - currentTx) / currentScale
    const worldY = (py - currentTy) / currentScale
    setScale(nextScale)
    setTx(px - worldX * nextScale)
    setTy(py - worldY * nextScale)
  }

  useEffect(() => {
    if (!selectedId || !pos.has(selectedId)) return
    if (focusedSelection.current === selectedId) return
    focusedSelection.current = selectedId
    centerOn(pos.get(selectedId)!)
  }, [selectedId, pos])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const { scale: currentScale } = transformRef.current
      const direction = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
      zoomAt(
        event.clientX,
        event.clientY,
        clampScale(currentScale * direction),
      )
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.tree-node, .tree-toolbar, .tree-search-hits')) return
    const { tx: currentTx, ty: currentTy } = transformRef.current
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originTx: currentTx,
      originTy: currentTy,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setTx(drag.originTx + (event.clientX - drag.startX))
    setTy(drag.originTy + (event.clientY - drag.startY))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  function selectAndFocus(id: string) {
    onSelect?.(id)
    const node = pos.get(id)
    if (node) {
      focusedSelection.current = id
      centerOn(node)
    }
  }

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault()
    const hit = searchHits[0]
    if (hit) {
      setQuery('')
      selectAndFocus(hit.id)
    }
  }

  const zoomPercent = Math.round(scale * 100)

  return (
    <div className="tree-shell">
      <div className="tree-toolbar">
        <form className="tree-search" onSubmit={onSearchSubmit}>
          <label className="sr-only" htmlFor="tree-search-input">
            Поиск человека
          </label>
          <input
            id="tree-search-input"
            type="search"
            placeholder="Найти по имени…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {searchHits.length > 0 && (
            <ul className="tree-search-hits">
              {searchHits.map((n) => {
                const names = cardNameLines(n)
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('')
                        selectAndFocus(n.id)
                      }}
                    >
                      <strong>{names.primary}</strong>
                      {names.secondary ? <span>{names.secondary}</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </form>
        <div className="tree-zoom">
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Уменьшить"
            onClick={() => {
              const viewport = viewportRef.current?.getBoundingClientRect()
              if (!viewport) {
                setScale((s) => clampScale(s / ZOOM_STEP))
                return
              }
              zoomAt(
                viewport.left + viewport.width / 2,
                viewport.top + viewport.height / 2,
                clampScale(scale / ZOOM_STEP),
              )
            }}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn-ghost tree-zoom__reset"
            onClick={() => {
              setScale(1)
              if (selectedId && pos.has(selectedId)) {
                focusedSelection.current = selectedId
                centerOn(pos.get(selectedId)!, 1)
              } else {
                setTx(0)
                setTy(0)
              }
            }}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Увеличить"
            onClick={() => {
              const viewport = viewportRef.current?.getBoundingClientRect()
              if (!viewport) {
                setScale((s) => clampScale(s * ZOOM_STEP))
                return
              }
              zoomAt(
                viewport.left + viewport.width / 2,
                viewport.top + viewport.height / 2,
                clampScale(scale * ZOOM_STEP),
              )
            }}
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`tree-viewport${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="tree-world"
          style={{
            width,
            height,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
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
              const isHot =
                !dimEdges || (hot.has(rel.source) && hot.has(rel.target))
              const classes = [
                'tree-edge',
                rel.type === 'SPOUSE' ? 'spouse' : 'kin',
                dimEdges && !isHot ? 'is-dim' : '',
                dimEdges && isHot ? 'is-hot' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <path
                  key={`${rel.type}-${rel.source}-${rel.target}-${i}`}
                  d={edgePath(a, b, rel.type)}
                  className={classes}
                  fill="none"
                />
              )
            })}

            {[...laid]
              .sort((a, b) => {
                const rank = (id: string) =>
                  id === selectedId ? 2 : id === rootId ? 1 : 0
                return rank(a.id) - rank(b.id)
              })
              .map((n) => {
              const years = [yearOf(n.birthDate), yearOf(n.deathDate)]
                .filter(Boolean)
                .join(' – ')
              const names = cardNameLines(n)
              const isSelected = n.id === selectedId
              const isRoot = n.id === rootId
              const isDim = dimEdges && !hot.has(n.id)
              return (
                <foreignObject
                  key={n.id}
                  x={n.x}
                  y={n.y}
                  width={CARD_W}
                  height={CARD_H}
                  className={`tree-fo${isSelected || isRoot ? ' is-front' : ''}`}
                >
                  <div
                    className={[
                      'tree-node',
                      isRoot ? 'is-root' : '',
                      isSelected ? 'is-selected' : '',
                      isDim ? 'is-dim' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={[names.primary, names.secondary, years]
                      .filter(Boolean)
                      .join(' · ')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() =>
                      setHoverId((current) => (current === n.id ? null : current))
                    }
                    onClick={() => selectAndFocus(n.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        selectAndFocus(n.id)
                      }
                    }}
                  >
                    <PersonAvatar person={n} size="sm" />
                    <div className="tree-node__text">
                      <strong className="tree-node__primary">
                        {names.primary}
                      </strong>
                      {names.secondary ? (
                        <span className="tree-node__secondary">
                          {names.secondary}
                        </span>
                      ) : null}
                      <span className="tree-node__years">{years || '—'}</span>
                    </div>
                  </div>
                </foreignObject>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}
