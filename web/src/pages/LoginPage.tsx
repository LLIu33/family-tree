import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ApiError,
  isAuthenticated,
  login,
  register,
  saveAuth,
} from '../api'
import './LoginPage.css'

type Mode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [treeName, setTreeName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result =
        mode === 'login'
          ? await login(email, password)
          : await register({
              email,
              password,
              name,
              treeName: treeName || undefined,
            })
      saveAuth(result.accessToken, result.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="login-stage fade-in">
      <div className="login-composition">
        <header className="login-hero">
          <p className="eyebrow">Семейный архив</p>
          <h1 className="brand brand-hero">
            Родник
            <span> · семейное древо</span>
          </h1>
          <p className="lede">
            Имена, ветви и связи — в одном месте, спокойно и по-человечески.
          </p>
        </header>

        <section className="login-panel panel" aria-label="Вход">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'tab active' : 'tab'}
              onClick={() => setMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'tab active' : 'tab'}
              onClick={() => setMode('register')}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={onSubmit}>
            {mode === 'register' && (
              <>
                <div className="field">
                  <label htmlFor="name">Ваше имя</label>
                  <input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="treeName">Название древа (необязательно)</label>
                  <input
                    id="treeName"
                    value={treeName}
                    onChange={(e) => setTreeName(e.target.value)}
                    placeholder="Например: Древо Ткаченко"
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn" type="submit" disabled={pending}>
              {pending
                ? 'Подождите…'
                : mode === 'login'
                  ? 'Войти'
                  : 'Создать древо'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
