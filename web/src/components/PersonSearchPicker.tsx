import { useEffect, useId, useMemo, useState } from 'react'
import { ApiError, searchIndividuals, type IndividualNode } from '../api'
import { formatPersonName, formatYears } from './personPanel.helpers'
import { PersonAvatar } from './PersonAvatar'

type SearchPerson = {
  id: string
  firstName?: string
  lastName?: string
}

type PersonSearchPickerProps = {
  excludeIds: string[]
  disabled?: boolean
  onSelect: (person: SearchPerson) => void
}

export function PersonSearchPicker({
  excludeIds,
  disabled = false,
  onSelect,
}: PersonSearchPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<IndividualNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)

      searchIndividuals(query, 12)
        .then((people) => {
          if (cancelled) return
          setResults(people.filter((person) => !excluded.has(person.id)))
        })
        .catch((err) => {
          if (cancelled) return
          setResults([])
          setError(
            err instanceof ApiError ? err.message : 'Не удалось выполнить поиск',
          )
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [excluded, query])

  const showEmpty = !loading && !error && results.length === 0

  return (
    <div className="person-search-picker">
      <div className="field">
        <label htmlFor={inputId}>Поиск человека</label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или фамилия"
          disabled={disabled}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted person-search-picker__state">Ищем…</p>}
      {showEmpty && (
        <p className="muted person-search-picker__state">Ничего не найдено</p>
      )}

      {results.length > 0 && (
        <div className="person-search-picker__results">
          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              className="person-search-picker__result"
              onClick={() => onSelect(person)}
              disabled={disabled}
            >
              <PersonAvatar person={person} size="sm" />
              <span className="person-search-picker__result-text">
                <strong>{formatPersonName(person)}</strong>
                <span>{formatYears(person)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
