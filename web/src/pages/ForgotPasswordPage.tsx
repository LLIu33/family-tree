import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, forgotPassword } from '../api'
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
          <p className="lede">
            Укажите email — если аккаунт есть, отправим ссылку для сброса пароля.
          </p>
        </header>
        <section className="login-panel panel" aria-label={title}>
          {children}
        </section>
      </div>
    </div>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setPending(true)
    try {
      const result = await forgotPassword(email)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить запрос')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthStage title="Сброс пароля">
      <h2 className="brand">Сброс пароля</h2>
      {message ? (
        <p className="success">{message}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={pending}>
            {pending ? 'Подождите…' : 'Отправить ссылку'}
          </button>
        </form>
      )}
      <p className="login-aux login-aux--after">
        <Link to="/login">Вернуться ко входу</Link>
      </p>
    </AuthStage>
  )
}
