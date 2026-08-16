import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  addChild,
  canWriteTree,
  createIndividual,
  createRelationship,
  deleteMedia,
  getIndividual,
  uploadIndividualMedia,
  updateIndividual,
  type IndividualDetail,
  type IndividualSummary,
} from '../api'
import {
  EMPTY_CHILD,
  EMPTY_RELATIVE,
  buildPersonForm,
  formatPersonName,
  formatYears,
  toChildInput,
  toRelativeInput,
  toSaveInput,
  type ChildFormState,
  type PersonFormState,
  type RelativeFormState,
} from './personPanel.helpers'
import { PersonAvatar } from './PersonAvatar'
import { PersonSearchPicker } from './PersonSearchPicker'
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
  children,
}: {
  title: string
  people: IndividualSummary[]
  onOpenPerson: (id: string) => void
  children?: ReactNode
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
              <PersonAvatar person={person} size="sm" />
              <span className="person-panel__relative-text">
                <strong>{formatPersonName(person)}</strong>
                <span>{formatYears(person)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted person-panel__empty">Нет данных</p>
      )}
      {children}
    </section>
  )
}

type RelativeRole = 'spouse' | 'parent'
type LinkRole = RelativeRole | 'child'
type ActionKey =
  | 'spouseCreate'
  | 'spouseLink'
  | 'parentCreate'
  | 'parentLink'
  | 'childLink'

const EMPTY_RELATIVE_FORMS: Record<RelativeRole, RelativeFormState> = {
  spouse: { ...EMPTY_RELATIVE },
  parent: { ...EMPTY_RELATIVE },
}

const EMPTY_RELATION_OPEN: Record<ActionKey, boolean> = {
  spouseCreate: false,
  spouseLink: false,
  parentCreate: false,
  parentLink: false,
  childLink: false,
}

const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function RelativeCreateForm({
  prefix,
  form,
  isSaving,
  submitLabel,
  onChange,
  onSubmit,
}: {
  prefix: string
  form: RelativeFormState
  isSaving: boolean
  submitLabel: string
  onChange: <K extends keyof RelativeFormState>(
    key: K,
    value: RelativeFormState[K],
  ) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="person-panel__mini-form" onSubmit={onSubmit}>
      <div className="person-panel__grid">
        <div className="field">
          <label htmlFor={`${prefix}-first-name`}>Имя</label>
          <input
            id={`${prefix}-first-name`}
            value={form.firstName}
            onChange={(event) => onChange('firstName', event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-last-name`}>Фамилия</label>
          <input
            id={`${prefix}-last-name`}
            value={form.lastName}
            onChange={(event) => onChange('lastName', event.target.value)}
            required
          />
        </div>
      </div>
      <div className="person-panel__grid">
        <div className="field">
          <label htmlFor={`${prefix}-sex`}>Пол</label>
          <select
            id={`${prefix}-sex`}
            value={form.sex}
            onChange={(event) => onChange('sex', event.target.value)}
          >
            <option value="M">Мужской</option>
            <option value="F">Женский</option>
            <option value="U">Не указан</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-birth-date`}>Дата рождения</label>
          <input
            id={`${prefix}-birth-date`}
            type="date"
            value={form.birthDate}
            onChange={(event) => onChange('birthDate', event.target.value)}
          />
        </div>
      </div>
      <button type="submit" className="btn" disabled={isSaving}>
        {isSaving ? 'Сохраняем…' : submitLabel}
      </button>
    </form>
  )
}

export function PersonPanel({
  personId,
  onClose,
  onOpenPerson,
  onTreeChanged,
}: PersonPanelProps) {
  const canWrite = canWriteTree()
  const [detail, setDetail] = useState<IndividualDetail | null>(null)
  const [form, setForm] = useState<PersonFormState | null>(null)
  const [childForm, setChildForm] = useState<ChildFormState>(EMPTY_CHILD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle')
  const [childState, setChildState] = useState<'idle' | 'saving'>('idle')
  const [relationState, setRelationState] = useState<ActionKey | null>(null)
  const [avatarState, setAvatarState] = useState<'idle' | 'uploading' | 'deleting'>(
    'idle',
  )
  const [isChildOpen, setIsChildOpen] = useState(false)
  const [relationOpen, setRelationOpen] =
    useState<Record<ActionKey, boolean>>(EMPTY_RELATION_OPEN)
  const [relativeForms, setRelativeForms] =
    useState<Record<RelativeRole, RelativeFormState>>(EMPTY_RELATIVE_FORMS)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const relatives = useMemo(
    () => detail?.relatives ?? { parents: [], spouses: [], children: [] },
    [detail],
  )

  const excludeIds = useMemo(
    () => [
      personId,
      ...relatives.parents.map((person) => person.id),
      ...relatives.spouses.map((person) => person.id),
      ...relatives.children.map((person) => person.id),
    ],
    [personId, relatives],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setInfoMessage(null)
    setIsChildOpen(false)
    setChildForm(EMPTY_CHILD)
    setRelationState(null)
    setRelationOpen(EMPTY_RELATION_OPEN)
    setRelativeForms(EMPTY_RELATIVE_FORMS)

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
    if (!form || !canWrite) return
    setSaveState('saving')
    setError(null)

    try {
      await updateIndividual(personId, toSaveInput(form))
      await refreshCurrentPerson()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить изменения')
    } finally {
      setSaveState('idle')
    }
  }

  async function refreshCurrentPerson() {
    await onTreeChanged()
    const fresh = await getIndividual(personId)
    setDetail(fresh)
    setForm(buildPersonForm(fresh))
  }

  async function handleAvatarInputChange(
    event: FormEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      setError('Поддерживаются только JPG, PNG и WEBP')
      return
    }

    setAvatarState('uploading')
    setError(null)
    setInfoMessage(null)
    try {
      await uploadIndividualMedia(personId, file)
      await refreshCurrentPerson()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить фото')
    } finally {
      setAvatarState('idle')
    }
  }

  async function handleDeleteAvatar(): Promise<void> {
    if (!detail?.avatarMediaId) return
    setAvatarState('deleting')
    setError(null)
    setInfoMessage(null)
    try {
      await deleteMedia(detail.avatarMediaId)
      await refreshCurrentPerson()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить фото')
    } finally {
      setAvatarState('idle')
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
      await refreshCurrentPerson()
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

  function updateRelativeForm<K extends keyof RelativeFormState>(
    role: RelativeRole,
    key: K,
    value: RelativeFormState[K],
  ) {
    setRelativeForms((current) => ({
      ...current,
      [role]: { ...current[role], [key]: value },
    }))
  }

  function toggleRelation(key: ActionKey) {
    setError(null)
    setInfoMessage(null)
    setRelationOpen((current) => ({ ...current, [key]: !current[key] }))
  }

  function buildRelationshipInput(role: LinkRole, otherPersonId: string) {
    if (role === 'spouse') {
      return {
        fromIndividualId: personId,
        toIndividualId: otherPersonId,
        relationshipType: 'SPOUSE' as const,
      }
    }

    if (role === 'parent') {
      return {
        fromIndividualId: otherPersonId,
        toIndividualId: personId,
        relationshipType: 'PARENT' as const,
      }
    }

    return {
      fromIndividualId: personId,
      toIndividualId: otherPersonId,
      relationshipType: 'PARENT' as const,
    }
  }

  async function handleCreateRelative(
    role: RelativeRole,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    const actionKey = role === 'spouse' ? 'spouseCreate' : 'parentCreate'
    setRelationState(actionKey)
    setError(null)
    setInfoMessage(null)

    try {
      const created = await createIndividual(toRelativeInput(relativeForms[role]))
      await createRelationship(buildRelationshipInput(role, created.id))
      await refreshCurrentPerson()
      setRelativeForms((current) => ({
        ...current,
        [role]: { ...EMPTY_RELATIVE },
      }))
      setRelationOpen((current) => ({ ...current, [actionKey]: false }))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось создать и привязать человека',
      )
    } finally {
      setRelationState(null)
    }
  }

  async function handleLinkRelative(
    role: LinkRole,
    person: { id: string; firstName?: string; lastName?: string },
  ) {
    const actionKey =
      role === 'spouse'
        ? 'spouseLink'
        : role === 'parent'
          ? 'parentLink'
          : 'childLink'

    setRelationState(actionKey)
    setError(null)
    setInfoMessage(null)

    try {
      await createRelationship(buildRelationshipInput(role, person.id))
      await refreshCurrentPerson()
      setRelationOpen((current) => ({ ...current, [actionKey]: false }))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось привязать существующего человека',
      )
    } finally {
      setRelationState(null)
    }
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
        <div className="person-panel__heading">
          <PersonAvatar
            person={{
              firstName: form.firstName,
              lastName: form.lastName,
              sex: form.sex,
              avatarUrl: detail.avatarUrl,
            }}
            size="md"
          />
          <div className="person-panel__heading-copy">
            <p className="eyebrow">Карточка</p>
            <h2>{formatPersonName(detail)}</h2>
            <div className="person-panel__avatar-tools">
              {canWrite && (
                <label className="btn btn-ghost person-panel__upload">
                  <input
                    type="file"
                    accept={AVATAR_MIME_TYPES.join(',')}
                    onChange={(event) => void handleAvatarInputChange(event)}
                    disabled={avatarState !== 'idle'}
                  />
                  {avatarState === 'uploading' ? 'Загружаем фото…' : 'Загрузить фото'}
                </label>
              )}
              {canWrite && detail.avatarMediaId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleDeleteAvatar()}
                  disabled={avatarState !== 'idle'}
                >
                  {avatarState === 'deleting' ? 'Удаляем фото…' : 'Удалить фото'}
                </button>
              ) : null}
            </div>
          </div>
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
            <input id="person-first-name" value={form.firstName} onChange={(e) => updateForm('firstName', e.target.value)} readOnly={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="person-last-name">Фамилия</label>
            <input id="person-last-name" value={form.lastName} onChange={(e) => updateForm('lastName', e.target.value)} readOnly={!canWrite} />
          </div>
        </div>
        <div className="person-panel__grid">
          <div className="field">
            <label htmlFor="person-name-prefix">Префикс / звание</label>
            <input id="person-name-prefix" value={form.namePrefix} onChange={(e) => updateForm('namePrefix', e.target.value)} readOnly={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="person-married-name">Фамилия в браке</label>
            <input id="person-married-name" value={form.marriedName} onChange={(e) => updateForm('marriedName', e.target.value)} readOnly={!canWrite} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="person-sex">Пол</label>
          <select id="person-sex" value={form.sex} onChange={(e) => updateForm('sex', e.target.value)} disabled={!canWrite}>
            <option value="M">Мужской</option>
            <option value="F">Женский</option>
            <option value="U">Не указан</option>
          </select>
        </div>
        <div className="person-panel__grid">
          <div className="field">
            <label htmlFor="person-birth-date">Дата рождения</label>
            <input id="person-birth-date" type="date" value={form.birthDate} onChange={(e) => updateForm('birthDate', e.target.value)} readOnly={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="person-death-date">Дата смерти</label>
            <input id="person-death-date" type="date" value={form.deathDate} onChange={(e) => updateForm('deathDate', e.target.value)} readOnly={!canWrite} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="person-birth-place">Место рождения</label>
          <input id="person-birth-place" value={form.birthPlace} onChange={(e) => updateForm('birthPlace', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-death-place">Место смерти</label>
          <input id="person-death-place" value={form.deathPlace} onChange={(e) => updateForm('deathPlace', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-death-cause">Причина смерти</label>
          <input id="person-death-cause" value={form.deathCause} onChange={(e) => updateForm('deathCause', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-burial-place">Место захоронения</label>
          <input id="person-burial-place" value={form.burialPlace} onChange={(e) => updateForm('burialPlace', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-occupation">Профессия</label>
          <input id="person-occupation" value={form.occupation} onChange={(e) => updateForm('occupation', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-retirement">Отставка / пенсия</label>
          <input id="person-retirement" value={form.retirementNote} onChange={(e) => updateForm('retirementNote', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-email">Email</label>
          <input id="person-email" type="text" value={form.email} onChange={(e) => updateForm('email', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-extra-events">Доп. события</label>
          <textarea id="person-extra-events" rows={3} value={form.extraEvents} onChange={(e) => updateForm('extraEvents', e.target.value)} readOnly={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="person-biography">Заметки</label>
          <textarea id="person-biography" rows={5} value={form.biography} onChange={(e) => updateForm('biography', e.target.value)} readOnly={!canWrite} />
        </div>
        {canWrite && (
          <button type="submit" className="btn" disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Сохраняем…' : 'Сохранить'}
          </button>
        )}
      </form>

      <RelativesSection title="Родители" people={relatives.parents} onOpenPerson={onOpenPerson}>
        {canWrite && (
          <>
            <div className="person-panel__actions">
              <button
                type="button"
                className="btn btn-ghost person-panel__toggle"
                onClick={() => toggleRelation('parentCreate')}
                disabled={relationState === 'parentLink'}
              >
                {relationOpen.parentCreate ? 'Скрыть создание' : 'Создать'}
              </button>
              <button
                type="button"
                className="btn btn-ghost person-panel__toggle"
                onClick={() => toggleRelation('parentLink')}
                disabled={relationState === 'parentCreate'}
              >
                {relationOpen.parentLink ? 'Скрыть поиск' : 'Выбрать'}
              </button>
            </div>
            {relationOpen.parentCreate && (
              <RelativeCreateForm
                prefix="parent"
                form={relativeForms.parent}
                isSaving={relationState === 'parentCreate'}
                submitLabel="Создать родителя"
                onChange={(key, value) => updateRelativeForm('parent', key, value)}
                onSubmit={(event) => handleCreateRelative('parent', event)}
              />
            )}
            {relationOpen.parentLink && (
              <PersonSearchPicker
                excludeIds={excludeIds}
                disabled={relationState === 'parentLink'}
                onSelect={(person) => void handleLinkRelative('parent', person)}
              />
            )}
          </>
        )}
      </RelativesSection>

      <RelativesSection title="Супруг(и)" people={relatives.spouses} onOpenPerson={onOpenPerson}>
        {canWrite && (
          <>
            <div className="person-panel__actions">
              <button
                type="button"
                className="btn btn-ghost person-panel__toggle"
                onClick={() => toggleRelation('spouseCreate')}
                disabled={relationState === 'spouseLink'}
              >
                {relationOpen.spouseCreate ? 'Скрыть создание' : 'Создать'}
              </button>
              <button
                type="button"
                className="btn btn-ghost person-panel__toggle"
                onClick={() => toggleRelation('spouseLink')}
                disabled={relationState === 'spouseCreate'}
              >
                {relationOpen.spouseLink ? 'Скрыть поиск' : 'Выбрать'}
              </button>
            </div>
            {relationOpen.spouseCreate && (
              <RelativeCreateForm
                prefix="spouse"
                form={relativeForms.spouse}
                isSaving={relationState === 'spouseCreate'}
                submitLabel="Создать супруга"
                onChange={(key, value) => updateRelativeForm('spouse', key, value)}
                onSubmit={(event) => handleCreateRelative('spouse', event)}
              />
            )}
            {relationOpen.spouseLink && (
              <PersonSearchPicker
                excludeIds={excludeIds}
                disabled={relationState === 'spouseLink'}
                onSelect={(person) => void handleLinkRelative('spouse', person)}
              />
            )}
          </>
        )}
      </RelativesSection>

      <RelativesSection title="Дети" people={relatives.children} onOpenPerson={onOpenPerson}>
        {canWrite && (
          <>
            <div className="person-panel__actions">
              <button
                type="button"
                className="btn btn-ghost person-panel__toggle"
                onClick={() => setIsChildOpen((value) => !value)}
              >
                {isChildOpen ? 'Скрыть форму ребёнка' : 'Добавить ребёнка'}
              </button>
              <button
                type="button"
                className="btn btn-ghost person-panel__toggle"
                onClick={() => toggleRelation('childLink')}
                disabled={childState === 'saving'}
              >
                {relationOpen.childLink ? 'Скрыть поиск' : 'Привязать существующего'}
              </button>
            </div>
            {relationOpen.childLink && (
              <PersonSearchPicker
                excludeIds={excludeIds}
                disabled={relationState === 'childLink'}
                onSelect={(person) => void handleLinkRelative('child', person)}
              />
            )}
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
          </>
        )}
      </RelativesSection>
    </aside>
  )
}
