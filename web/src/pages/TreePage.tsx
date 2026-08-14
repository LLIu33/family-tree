import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getFullGraph } from '../api'
import type { IndividualNode, TreeRelationship } from '../api'
import { AppNav } from '../components/AppNav'
import { CreatePersonForm } from '../components/CreatePersonForm'
import { PersonPanel } from '../components/PersonPanel'
import { TreeCanvas } from '../components/TreeCanvas'
import './TreePage.css'

export function TreePage() {
  const [nodes, setNodes] = useState<IndividualNode[]>([])
  const [relationships, setRelationships] = useState<TreeRelationship[]>([])
  const [rootId, setRootId] = useState<string | null>(null)
  const [componentCount, setComponentCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

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
            <button
              type="button"
              className="btn"
              onClick={() => setIsCreateOpen(true)}
            >
              Добавить человека
            </button>
            {nodes.length > 0 && (
              <p className="muted field-hint">
                Людей: {nodes.length}
                {componentCount > 1 ? ` · отдельных веток: ${componentCount}` : ''}
              </p>
            )}
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="pick-note">
            <p className="muted">В древе пока никого нет.</p>
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

        <CreatePersonForm
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onCreated={async (id) => {
            await refreshGraph()
            setSelectedId(id)
            setIsCreateOpen(false)
          }}
        />
      </main>
    </div>
  )
}
