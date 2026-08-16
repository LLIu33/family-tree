import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, canWriteTree, createRelationship, getFullGraph } from '../api'
import type { IndividualNode, TreeRelationship } from '../api'
import { AppNav } from '../components/AppNav'
import { CreatePersonForm } from '../components/CreatePersonForm'
import { PersonPanel } from '../components/PersonPanel'
import { TreeCanvas } from '../components/TreeCanvas'
import './TreePage.css'

type LinkRelationshipType = 'SPOUSE' | 'PARENT_AB' | 'PARENT_BA'

type LinkState =
  | { status: 'off' }
  | { status: 'pick'; picks: string[] }
  | {
      status: 'confirm'
      a: string
      b: string
      relationshipType: LinkRelationshipType
    }

const LINK_OFF: LinkState = { status: 'off' }

function pickedIdsFrom(state: LinkState): string[] {
  if (state.status === 'pick') return state.picks
  if (state.status === 'confirm') return [state.a, state.b]
  return []
}

function linkLabel(
  id: string,
  byId: Map<string, IndividualNode>,
  fallback: string,
): string {
  const person = byId.get(id)
  if (!person) return fallback
  const parts = [person.firstName?.trim(), person.lastName?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : fallback
}

export function TreePage() {
  const canWrite = canWriteTree()
  const [nodes, setNodes] = useState<IndividualNode[]>([])
  const [relationships, setRelationships] = useState<TreeRelationship[]>([])
  const [rootId, setRootId] = useState<string | null>(null)
  const [componentCount, setComponentCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [linkState, setLinkState] = useState<LinkState>(LINK_OFF)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [isLinkSaving, setIsLinkSaving] = useState(false)

  const nodeById = useMemo(() => {
    const map = new Map<string, IndividualNode>()
    for (const node of nodes) map.set(node.id, node)
    return map
  }, [nodes])
  const linkPickIds = pickedIdsFrom(linkState)
  const isLinkMode = linkState.status !== 'off'

  async function refreshGraph() {
    try {
      setError(null)
      const data = await getFullGraph()
      setNodes(data.nodes ?? [])
      setRelationships(data.relationships ?? [])
      setRootId(data.rootId)
      setComponentCount(data.componentCount ?? 0)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось загрузить древо',
      )
      throw err
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getFullGraph()
      .then((data) => {
        if (cancelled) return
        setNodes(data.nodes ?? [])
        setRelationships(data.relationships ?? [])
        setRootId(data.rootId)
        setComponentCount(data.componentCount ?? 0)
      })
      .catch((err) => {
        if (cancelled) return
        setNodes([])
        setRelationships([])
        setRootId(null)
        setSelectedId(null)
        setError(
          err instanceof ApiError ? err.message : 'Не удалось загрузить древо',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLinkMode) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLinkState(LINK_OFF)
        setLinkError(null)
        setIsLinkSaving(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isLinkMode])

  function startLinkMode() {
    setSelectedId(null)
    setLinkError(null)
    setLinkState({ status: 'pick', picks: [] })
  }

  function cancelLinkMode() {
    setLinkError(null)
    setIsLinkSaving(false)
    setLinkState(LINK_OFF)
  }

  function handleLinkPick(id: string) {
    setLinkError(null)
    setLinkState((current) => {
      if (current.status !== 'pick' || current.picks.includes(id)) return current
      const picks = [...current.picks, id]
      return picks.length < 2
        ? { status: 'pick', picks }
        : { status: 'confirm', a: picks[0], b: picks[1], relationshipType: 'SPOUSE' }
    })
  }

  async function confirmLink() {
    if (linkState.status !== 'confirm') return
    setIsLinkSaving(true)
    setLinkError(null)

    try {
      if (linkState.relationshipType === 'SPOUSE') {
        await createRelationship({
          fromIndividualId: linkState.a,
          toIndividualId: linkState.b,
          relationshipType: 'SPOUSE',
        })
      } else if (linkState.relationshipType === 'PARENT_AB') {
        await createRelationship({
          fromIndividualId: linkState.a,
          toIndividualId: linkState.b,
          relationshipType: 'PARENT',
        })
      } else {
        await createRelationship({
          fromIndividualId: linkState.b,
          toIndividualId: linkState.a,
          relationshipType: 'PARENT',
        })
      }
      await refreshGraph()
      cancelLinkMode()
    } catch (err) {
      setLinkError(
        err instanceof ApiError ? err.message : 'Не удалось создать связь',
      )
    } finally {
      setIsLinkSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page tree-page fade-in">
        <p className="eyebrow">Визуализация</p>
        <h1 className="brand">Карта</h1>
        <p className="lede">
          Показываем всё ваше семейное древо, включая отдельные ветки, если они
          есть.
        </p>

        {loading && <p className="muted">Загружаем визуализацию…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && (nodes.length > 0 || !error) && (
          <div className="tree-toolbar">
            <div className="tree-toolbar__actions">
              {canWrite && (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setIsCreateOpen(true)}
                    disabled={isLinkMode}
                  >
                    Добавить человека
                  </button>
                  <button
                    type="button"
                    className={`btn ${isLinkMode ? 'btn-ghost' : ''}`}
                    onClick={() => (isLinkMode ? cancelLinkMode() : startLinkMode())}
                  >
                    {isLinkMode ? 'Отменить связь' : 'Связать'}
                  </button>
                </>
              )}
            </div>
            {nodes.length > 0 && (
              <p className="muted field-hint">
                Людей: {nodes.length}
                {componentCount > 1 ? ` · отдельных веток: ${componentCount}` : ''}
              </p>
            )}
          </div>
        )}

        {linkError && <p className="error tree-link-error">{linkError}</p>}

        {linkState.status === 'pick' && (
          <section className="tree-link-panel panel">
            <p className="tree-link-panel__title">Режим связывания</p>
            <p className="muted">
              Выберите двух людей на схеме. Пустое место не сбрасывает режим, `Esc`
              отменяет.
            </p>
            <p className="muted tree-link-panel__progress">
              Выбрано: {linkState.picks.length} из 2
            </p>
          </section>
        )}

        {linkState.status === 'confirm' && (
          <section className="tree-link-panel panel">
            <p className="tree-link-panel__title">Подтвердить связь</p>
            <p className="muted tree-link-panel__summary">
              A: {linkLabel(linkState.a, nodeById, 'Человек A')} · B:{' '}
              {linkLabel(linkState.b, nodeById, 'Человек B')}
            </p>
            <div className="tree-link-options" role="radiogroup" aria-label="Тип связи">
              <label className="tree-link-option">
                <input
                  type="radio"
                  name="relationshipType"
                  checked={linkState.relationshipType === 'SPOUSE'}
                  onChange={() =>
                    setLinkState((current) =>
                      current.status === 'confirm'
                        ? { ...current, relationshipType: 'SPOUSE' }
                        : current,
                    )
                  }
                />
                <span>Супруги</span>
              </label>
              <label className="tree-link-option">
                <input
                  type="radio"
                  name="relationshipType"
                  checked={linkState.relationshipType === 'PARENT_AB'}
                  onChange={() =>
                    setLinkState((current) =>
                      current.status === 'confirm'
                        ? { ...current, relationshipType: 'PARENT_AB' }
                        : current,
                    )
                  }
                />
                <span>A родитель B</span>
              </label>
              <label className="tree-link-option">
                <input
                  type="radio"
                  name="relationshipType"
                  checked={linkState.relationshipType === 'PARENT_BA'}
                  onChange={() =>
                    setLinkState((current) =>
                      current.status === 'confirm'
                        ? { ...current, relationshipType: 'PARENT_BA' }
                        : current,
                    )
                  }
                />
                <span>B родитель A</span>
              </label>
            </div>
            <div className="tree-link-panel__actions">
              <button
                type="button"
                className="btn"
                onClick={() => void confirmLink()}
                disabled={isLinkSaving}
              >
                {isLinkSaving ? 'Сохраняем…' : 'Подтвердить'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={cancelLinkMode}
                disabled={isLinkSaving}
              >
                Отмена
              </button>
            </div>
          </section>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="pick-note">
            <p className="muted">В древе пока никого нет.</p>
            {canWrite && (
              <div className="tree-empty-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsCreateOpen(true)}
                >
                  Добавить человека
                </button>
                <Link className="btn btn-ghost" to="/import">
                  Импорт GEDCOM
                </Link>
              </div>
            )}
          </div>
        )}

        {!loading && nodes.length > 0 && (
          <>
            <div className="tree-layout">
              <div className="canvas-wrap">
                <TreeCanvas
                  nodes={nodes}
                  relationships={relationships}
                  rootId={rootId}
                  selectedId={selectedId}
                  linkMode={isLinkMode}
                  linkPickIds={linkPickIds}
                  onLinkPick={handleLinkPick}
                  onSelect={setSelectedId}
                />
              </div>
              {selectedId && (
                <PersonPanel
                  personId={selectedId}
                  onClose={() => setSelectedId(null)}
                  onOpenPerson={setSelectedId}
                  onTreeChanged={refreshGraph}
                />
              )}
            </div>
          </>
        )}

        {canWrite && (
          <CreatePersonForm
            open={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            onCreated={async (id) => {
              await refreshGraph()
              setSelectedId(id)
              setIsCreateOpen(false)
            }}
          />
        )}
      </main>
    </div>
  )
}
