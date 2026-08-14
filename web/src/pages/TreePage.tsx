import { useEffect, useState } from 'react'
import { ApiError, getFullGraph } from '../api'
import type { IndividualNode, TreeRelationship } from '../api'
import { AppNav } from '../components/AppNav'
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

  async function refreshGraph() {
    const data = await getFullGraph()
    setNodes(data.nodes ?? [])
    setRelationships(data.relationships ?? [])
    setRootId(data.rootId)
    setComponentCount(data.componentCount ?? 0)
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
          Показываем всё ваше семейное древо. Если в данных несколько отдельных
          веток, берём самую большую.
        </p>

        {loading && <p className="muted">Загружаем визуализацию…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && nodes.length === 0 && (
          <p className="muted pick-note">
            В древе пока никого нет. Импортируйте GEDCOM на странице «Импорт».
          </p>
        )}

        {!loading && !error && nodes.length > 0 && (
          <>
            <p className="muted field-hint">
              Людей: {nodes.length}
              {componentCount > 1
                ? ` · отдельных веток: ${componentCount} (показана первая/крупнейшая)`
                : ''}
            </p>
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
      </main>
    </div>
  )
}
