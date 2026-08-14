import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, createIndividual } from '../api'
import {
  EMPTY_CREATE_PERSON,
  toCreateIndividualInput,
  validateCreatePersonForm,
  type CreatePersonFormState,
} from './createPersonForm.helpers'
import './CreatePersonForm.css'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}

export function CreatePersonForm({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreatePersonFormState>(EMPTY_CREATE_PERSON)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle')

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_CREATE_PERSON)
    setError(null)
    setSaveState('idle')
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  function updateForm<K extends keyof CreatePersonFormState>(
    key: K,
    value: CreatePersonFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateCreatePersonForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaveState('saving')
    setError(null)

    try {
      const person = await createIndividual(toCreateIndividualInput(form))
      await onCreated(person.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать человека')
      setSaveState('idle')
    }
  }

  if (!open) return null

  return (
    <div className="create-person-backdrop" onClick={onClose}>
      <div
        className="create-person panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="create-person__header">
          <div>
            <p className="eyebrow">Новый человек</p>
            <h2>Добавить человека</h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost create-person__close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <form className="create-person__form" onSubmit={handleSubmit}>
          <div className="create-person__grid">
            <div className="field">
              <label htmlFor="create-person-first-name">Имя</label>
              <input
                id="create-person-first-name"
                value={form.firstName}
                onChange={(event) => updateForm('firstName', event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="create-person-last-name">Фамилия</label>
              <input
                id="create-person-last-name"
                value={form.lastName}
                onChange={(event) => updateForm('lastName', event.target.value)}
              />
            </div>
          </div>

          <div className="create-person__grid">
            <div className="field">
              <label htmlFor="create-person-sex">Пол</label>
              <select
                id="create-person-sex"
                value={form.sex}
                onChange={(event) => updateForm('sex', event.target.value)}
              >
                <option value="M">Мужской</option>
                <option value="F">Женский</option>
                <option value="U">Не указан</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="create-person-birth-date">Дата рождения</label>
              <input
                id="create-person-birth-date"
                type="date"
                value={form.birthDate}
                onChange={(event) => updateForm('birthDate', event.target.value)}
              />
            </div>
          </div>

          <div className="create-person__actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn" disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Создаём…' : 'Добавить человека'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
