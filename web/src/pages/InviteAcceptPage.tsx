import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, acceptInvite, isAuthenticated, saveAuth } from '../api'
import { AppNav } from '../components/AppNav'

export function InviteAcceptPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true })
      return
    }
    if (!isAuthenticated()) {
      navigate(
        `/login?returnUrl=${encodeURIComponent(`/invite/${token}`)}`,
        { replace: true },
      )
      return
    }

    let cancelled = false
    acceptInvite(token)
      .then((result) => {
        if (cancelled) return
        saveAuth(result.accessToken, result.user)
        navigate('/tree', { replace: true })
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError ? err.message : 'Не удалось принять приглашение',
        )
      })

    return () => {
      cancelled = true
    }
  }, [token, navigate])

  return (
    <div className="app-shell">
      {isAuthenticated() && <AppNav />}
      <main className="page fade-in">
        <p className="eyebrow">Приглашение</p>
        <h1 className="brand">Доступ к древу</h1>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="muted">Принимаем приглашение…</p>
        )}
      </main>
    </div>
  )
}
