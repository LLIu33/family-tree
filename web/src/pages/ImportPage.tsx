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
      setError('Choose a .ged file first')
      return
    }
    setError(null)
    setMessage(null)
    setPending(true)
    try {
      const result = await importGedcom(file)
      const summary =
        result && typeof result === 'object'
          ? JSON.stringify(result).slice(0, 180)
          : 'Import finished'
      setMessage(`Import succeeded. ${summary}${summary.length >= 180 ? '…' : ''}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page fade-in">
        <p className="eyebrow">Bring records home</p>
        <h1 className="brand">Import GEDCOM</h1>
        <p className="lede">
          Upload a genealogy file. We send it as multipart form data with
          source=web.
        </p>

        <form className="import-panel panel" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="gedcom">GEDCOM file</label>
            <input
              id="gedcom"
              type="file"
              accept=".ged,.gedcom,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {file && (
            <p className="muted file-name">
              Selected: <strong>{file.name}</strong>
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="btn" type="submit" disabled={pending || !file}>
            {pending ? 'Uploading…' : 'Upload & import'}
          </button>
        </form>
      </main>
    </div>
  )
}
