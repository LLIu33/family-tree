import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ApiError,
  addChild,
  getIndividual,
  updateIndividual,
  type IndividualDetail,
  type IndividualSummary,
} from '../api'
import {
  EMPTY_CHILD,
  buildPersonForm,
  formatPersonName,
  formatYears,
  toChildInput,
  toSaveInput,
  type ChildFormState,
  type PersonFormState,
} from './personPanel.helpers'
import './PersonPanel.css'

interface PersonPanelProps {
  personId: string
  onClose: () => void
  onOpenPerson: (id: string) => void
  onTreeChanged: () => Promise<void>
}

function RelativesSection({
  title,
  people,
  onOpenPerson,
}: {
  title: string
  people: IndividualSummary[]
  onOpenPerson: (id: string) => void
}) {
  return (
    <section className="person-panel__section">
      <h3>{title}</h3>
      {people.length > 0 ? (
        <div className="person-panel__relatives">
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              className="person-panel__relative"
              onClick={() => onOpenPerson(person.id)}
            >
              <strong>{formatPersonName(person)}</strong>
              <span>{formatYears(person)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted person-panel__empty">Нет данных</p>
      )}
    </section>
  )
}

export function PersonPanel({
  personId,
  onClose,
  onOpenPerson,
  onTreeChanged,
}: PersonPanelProps) {
  const [detail, setDetail] = useState<IndividualDetail | null>(null)
  const [form, setForm] = useState<PersonFormState | null>(null)
  const [childForm, setChildForm] = useState<ChildFormState>(EMPTY_CHILD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle')
  const [childState, setChildState] = useState<'idle' | 'saving'>('idle')
  const [isChildOpen, setIsChildOpen] = useState(false)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const relatives = useMemo(
    () => detail?.relatives ?? { parents: [], spouses: [], children: [] },
    [detail],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setInfoMessage(null)
    setIsChildOpen(false)
    setChildForm(EMPTY_CHILD)

    getIndividual(personId)
      .then((data) => {
        if (cancelled) return
        setDetail(data)
        setForm(buildPersonForm(data))
      })
      .catch((err) => {
        if (cancelled) return
        setDetail(null)
        setForm(null)
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить человека')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [personId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setSaveState('saving')
    setError(null)

    try {
      await updateIndividual(personId, toSaveInput(form))
      await onTreeChanged()
      const fresh = await getIndividual(personId)
      setDetail(fresh)
      setForm(buildPersonForm(fresh))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить изменения')
    } finally {
      setSaveState('idle')
    }
  }

  async function handleAddChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const spouseCount = relatives.spouses.length
    setChildState('saving')
    setError(null)
    setInfoMessage(null)

    try {
      const result = await addChild(personId, toChildInput(childForm))
      const singleParentOnly = result.linkedParentIds.length === 1 && spouseCount > 1
      if (singleParentOnly) {
        setInfoMessage(
          'Ребёнок привязан только к выбранному родителю (несколько супругов)',
        )
      }
      await onTreeChanged()
      const fresh = await getIndividual(personId)
      setDetail(fresh)
      setForm(buildPersonForm(fresh))
      setChildForm(EMPTY_CHILD)
      setIsChildOpen(false)
      if (!singleParentOnly) {
        onOpenPerson(result.child.id)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось добавить ребёнка')
    } finally {
      setChildState('idle')
    }
  }

  function updateForm<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  function updateChildForm<K extends keyof ChildFormState>(
    key: K,
    value: ChildFormState[K],
  ) {
    setChildForm((current) => ({ ...current, [key]: value }))
  }

  if (loading || (error && !form)) {
    return (
      <aside className="person-panel panel">
        <div className="person-panel__header">
          <h2>Карточка</h2>
          <button type="button" className="btn btn-ghost person-panel__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className={error ? 'error' : 'muted'}>
          {error ?? 'Загружаем карточку…'}
        </p>
      </aside>
    )
  }
  if (!form || !detail) return null

  return (
    <aside className="person-panel panel">
      <div className="person-panel__header">
        <div>
          <p className="eyebrow">Карточка</p>
          <h2>{formatPersonName(detail)}</h2>
        </div>
        <button type="button" className="btn btn-ghost person-panel__close" onClick={onClose}>
          ✕
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {infoMessage && <p className="muted person-panel__note">{infoMessage}</p>}

      <form className="person-panel__form" onSubmit={handleSave}>
        <div className="person-panel__grid">
          <div className="field">
            <label htmlFor="person-first-name">Имя</label>
            <input id="person-first-name" value={form.firstName} onChange={(e) => updateForm('firstName', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="person-last-name">Фамилия</label>
            <input id="person-last-name" value={form.lastName} onChange={(e) => updateForm('lastName', e.target.value)} />
          </div>
        </div>
        <div className="person-panel__grid">
          <div className="field">
            <label htmlFor="person-name-prefix">Префикс / звание</label>
            <input id="person-name-prefix" value={form.namePrefix} onChange={(e) => updateForm('namePrefix', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="person-married-name">Фамилия в браке</label>
            <input id="person-married-name" value={form.marriedName} onChange={(e) => updateForm('marriedName', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="person-sex">Пол</label>
          <select id="person-sex" value={form.sex} onChange={(e) => updateForm('sex', e.target.value)}>
            <option value="M">Мужской</option>
            <option value="F">Женский</option>
            <option value="U">Не указан</option>
          </select>
        </div>
        <div className="person-panel__grid">
          <div className="field">
            <label htmlFor="person-birth-date">Дата рождения</label>
            <input id="person-birth-date" type="date" value={form.birthDate} onChange={(e) => updateForm('birthDate', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="person-death-date">Дата смерти</label>
            <input id="person-death-date" type="date" value={form.deathDate} onChange={(e) => updateForm('deathDate', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="person-birth-place">Место рождения</label>
          <input id="person-birth-place" value={form.birthPlace} onChange={(e) => updateForm('birthPlace', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-death-place">Место смерти</label>
          <input id="person-death-place" value={form.deathPlace} onChange={(e) => updateForm('deathPlace', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-death-cause">Причина смерти</label>
          <input id="person-death-cause" value={form.deathCause} onChange={(e) => updateForm('deathCause', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-burial-place">Место захоронения</label>
          <input id="person-burial-place" value={form.burialPlace} onChange={(e) => updateForm('burialPlace', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-occupation">Профессия</label>
          <input id="person-occupation" value={form.occupation} onChange={(e) => updateForm('occupation', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-retirement">Отставка / пенсия</label>
          <input id="person-retirement" value={form.retirementNote} onChange={(e) => updateForm('retirementNote', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-email">Email</label>
          <input id="person-email" type="text" value={form.email} onChange={(e) => updateForm('email', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-extra-events">Доп. события</label>
          <textarea id="person-extra-events" rows={3} value={form.extraEvents} onChange={(e) => updateForm('extraEvents', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-biography">Заметки</label>
          <textarea id="person-biography" rows={5} value={form.biography} onChange={(e) => updateForm('biography', e.target.value)} />
        </div>
        <button type="submit" className="btn" disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>

      <RelativesSection title="Родители" people={relatives.parents} onOpenPerson={onOpenPerson} />
      <RelativesSection title="Супруг(и)" people={relatives.spouses} onOpenPerson={onOpenPerson} />
      <RelativesSection title="Дети" people={relatives.children} onOpenPerson={onOpenPerson} />

      <section className="person-panel__section">
        <button type="button" className="btn btn-ghost person-panel__toggle" onClick={() => setIsChildOpen((value) => !value)}>
          Добавить ребёнка
        </button>
        {isChildOpen && (
          <form className="person-panel__child-form" onSubmit={handleAddChild}>
            <div className="field">
              <label htmlFor="child-first-name">Имя</label>
              <input id="child-first-name" value={childForm.firstName} onChange={(e) => updateChildForm('firstName', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="child-last-name">Фамилия</label>
              <input id="child-last-name" value={childForm.lastName} onChange={(e) => updateChildForm('lastName', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="child-sex">Пол</label>
              <select id="child-sex" value={childForm.sex} onChange={(e) => updateChildForm('sex', e.target.value)}>
                <option value="M">Мужской</option>
                <option value="F">Женский</option>
                <option value="U">Не указан</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="child-birth-date">Дата рождения</label>
              <input id="child-birth-date" type="date" value={childForm.birthDate} onChange={(e) => updateChildForm('birthDate', e.target.value)} />
            </div>
            <button type="submit" className="btn" disabled={childState === 'saving'}>
              {childState === 'saving' ? 'Добавляем…' : 'Добавить ребёнка'}
            </button>
          </form>
        )}
      </section>
    </aside>
  )
}
