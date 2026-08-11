import { Link, NavLink, useNavigate } from 'react-router-dom'
import { clearAuth, getStoredUser } from '../api'

export function AppNav() {
  const navigate = useNavigate()
  const user = getStoredUser()

  function logout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <header className="top-nav fade-in">
      <Link to="/" className="brand brand-mark" style={{ textDecoration: 'none', color: 'inherit' }}>
        Родник
        <span>древо</span>
      </Link>
      <nav>
        <NavLink to="/" end>
          Домой
        </NavLink>
        <NavLink to="/tree">Древо</NavLink>
        <NavLink to="/import">Импорт</NavLink>
        {user && <span className="muted">{user.name || user.email}</span>}
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Выйти
        </button>
      </nav>
    </header>
  )
}
