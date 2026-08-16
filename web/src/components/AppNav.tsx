import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  ApiError,
  canWriteTree,
  clearAuth,
  getStoredUser,
  listTrees,
  saveAuth,
  switchTree,
  type TreeSummary,
} from '../api'
import { BrandLockup } from './BrandLockup'

export function AppNav() {
  const navigate = useNavigate()
  const user = getStoredUser()
  const [trees, setTrees] = useState<TreeSummary[]>([])
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    const current = getStoredUser()
    let cancelled = false
    listTrees()
      .then((rows) => {
        if (!cancelled) setTrees(rows)
      })
      .catch(() => {
        if (!cancelled && current) {
          setTrees([
            { id: current.treeId, name: current.treeName, role: current.role },
          ])
        }
      })
    return () => {
      cancelled = true
    }
  }, [user?.treeId])

  function logout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  async function onSwitchTree(treeId: string) {
    if (!treeId || treeId === user?.treeId || switching) return
    setSwitchError(null)
    setSwitching(true)
    try {
      const result = await switchTree(treeId)
      saveAuth(result.accessToken, result.user)
      window.location.assign('/')
    } catch (err) {
      setSwitchError(
        err instanceof ApiError ? err.message : 'Не удалось переключить древо',
      )
      setSwitching(false)
    }
  }

  const options =
    trees.length > 0
      ? trees
      : user
        ? [{ id: user.treeId, name: user.treeName, role: user.role }]
        : []

  return (
    <header className="top-nav fade-in">
      <Link to="/" aria-label="Древо — на главную" style={{ textDecoration: 'none', color: 'inherit' }}>
        <BrandLockup size={28} />
      </Link>
      <nav>
        <NavLink to="/" end>
          Домой
        </NavLink>
        <NavLink to="/tree">Карта</NavLink>
        {canWriteTree(user) && <NavLink to="/import">Импорт</NavLink>}
        {user?.role === 'owner' && <NavLink to="/access">Доступ</NavLink>}
        {options.length > 0 && (
          <label className="tree-switcher-label">
            <span className="visually-hidden">Текущее древо</span>
            <select
              className="tree-switcher"
              aria-label="Текущее древо"
              value={user?.treeId ?? ''}
              disabled={switching}
              onChange={(event) => void onSwitchTree(event.target.value)}
            >
              {options.map((tree) => (
                <option key={tree.id} value={tree.id}>
                  {tree.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {switchError && <span className="error tree-switcher-error">{switchError}</span>}
        {user && <span className="muted">{user.name || user.email}</span>}
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Выйти
        </button>
      </nav>
    </header>
  )
}
