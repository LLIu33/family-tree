import type {
  AddChildInput,
  IndividualDetail,
  IndividualSummary,
  UpdateIndividualInput,
} from '../api'

export type PersonFormState = {
  firstName: string
  lastName: string
  sex: string
  birthDate: string
  deathDate: string
  birthPlace: string
  deathPlace: string
  biography: string
}

export type ChildFormState = {
  firstName: string
  lastName: string
  sex: string
  birthDate: string
}

export const EMPTY_CHILD: ChildFormState = {
  firstName: '',
  lastName: '',
  sex: 'U',
  birthDate: '',
}

function toDateInput(value?: string): string {
  return value ? value.slice(0, 10) : ''
}

function toText(value?: string | null): string {
  return value?.trim() ?? ''
}

function toOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function buildPersonForm(detail: IndividualDetail): PersonFormState {
  return {
    firstName: detail.firstName?.trim() ?? '',
    lastName: detail.lastName?.trim() ?? '',
    sex: detail.sex ?? 'U',
    birthDate: toDateInput(detail.birthDate),
    deathDate: toDateInput(detail.deathDate),
    birthPlace: toText(detail.birthPlace),
    deathPlace: toText(detail.deathPlace),
    biography: detail.biography ?? '',
  }
}

export function formatPersonName(
  person: Pick<IndividualSummary, 'firstName' | 'lastName'>,
): string {
  const parts = [person.firstName?.trim(), person.lastName?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Без имени'
}

export function formatYears(
  person: Pick<IndividualSummary, 'birthDate' | 'deathDate'>,
): string {
  const years = [person.birthDate, person.deathDate]
    .map((value) => toDateInput(value)?.slice(0, 4))
    .filter(Boolean)
  return years.length > 0 ? years.join(' - ') : '—'
}

export function toSaveInput(form: PersonFormState): UpdateIndividualInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    sex: form.sex,
    birthDate: form.birthDate || null,
    deathDate: form.deathDate || null,
    birthPlace: toOptionalText(form.birthPlace),
    deathPlace: toOptionalText(form.deathPlace),
    biography: toOptionalText(form.biography),
  }
}

export function toChildInput(form: ChildFormState): AddChildInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    sex: form.sex,
    birthDate: form.birthDate || undefined,
  }
}
