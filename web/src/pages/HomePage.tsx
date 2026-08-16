import { Link } from 'react-router-dom'
import { getStoredUser, canWriteTree } from '../api'
import { AppNav } from '../components/AppNav'
import './HomePage.css'

export function HomePage() {
  const user = getStoredUser()
  const treeName = user?.treeName || 'Ваше семейное древо'
  const canWrite = canWriteTree(user)

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page home-page fade-in">
        <p className="eyebrow">Ваш сайт</p>
        <h1 className="brand home-title">{treeName}</h1>
        <p className="lede">
          Откройте древо, чтобы смотреть ветви, или загрузите GEDCOM, когда
          будете готовы пополнить архив.
        </p>

        <div className="home-actions">
          <Link className="btn" to="/tree">
            Открыть древо
          </Link>
          {canWrite && (
            <Link className="btn btn-ghost" to="/import">
              Импорт GEDCOM
            </Link>
          )}
        </div>

        <p className="home-note muted">
          После импорта GEDCOM откройте «Карта» — покажется всё древо целиком.
        </p>
      </main>
    </div>
  )
}
