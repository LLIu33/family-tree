import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, resetPassword } from '../api'
import { BrandLockup } from '../components/BrandLockup'
import './LoginPage.css'

function AuthStage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="login-stage fade-in">
      <div className="login-composition">
        <header className="login-hero">
          <p className="eyebrow">Семейный архив</p>
          <div className="login-brand-row">
            <BrandLockup size={48} withWordmark={false} />
            <h1 className="brand brand-hero">
              Древо
              <span> · семейный архив</span>
            </h1>
          </div>
          <p className="lede">Задайте новый пароль для входа.</p>
        </header>
        <section className="login-panel panel" aria-label={title}>
          {children}
        </section>
      </div>
    </div>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(
    token ? null : 'В ссылке нет токена сброса. Запросите новую ссылку.',
  )
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    setError(null)
    setPending(true)
    try {
      await resetPassword(token, password)
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось обновить пароль')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthStage title="Новый пароль">
      <h2 className="brand">Новый пароль</h2>
      {token ? (
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="reset-password">Пароль</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label htmlFor="reset-confirm">Повторите пароль</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={pending}>
            {pending ? 'Подождите…' : 'Сохранить пароль'}
          </button>
        </form>
      ) : (
        <p className="error">{error}</p>
      )}
      <p className="login-aux login-aux--after">
        <Link to="/login">Вернуться ко входу</Link>
      </p>
    </AuthStage>
  )
}
