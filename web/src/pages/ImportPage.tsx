import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, importGedcom } from '../api'
import { AppNav } from '../components/AppNav'
import './ImportPage.css'

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Сначала выберите файл .ged')
      return
    }
    setError(null)
    setMessage(null)
    setPending(true)
    try {
      const result = (await importGedcom(file)) as {
        individuals?: number
        families?: number
      }
      const people = result?.individuals ?? 0
      const families = result?.families ?? 0
      setMessage(`Импорт завершён: людей ${people}, семей ${families}.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Импорт не удался')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page fade-in">
        <p className="eyebrow">Импорт</p>
        <h1 className="brand">GEDCOM</h1>
        <p className="lede">
          Загрузите файл генеалогии (.ged). Данные попадут в ваше текущее
          древо.
        </p>

        <form className="import-panel panel" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="gedcom">Файл GEDCOM</label>
            <input
              id="gedcom"
              type="file"
              accept=".ged,.gedcom,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {file && (
            <p className="muted file-name">
              Выбран: <strong>{file.name}</strong>
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="btn" type="submit" disabled={pending || !file}>
            {pending ? 'Загружаем…' : 'Импортировать'}
          </button>
        </form>
      </main>
    </div>
  )
}
