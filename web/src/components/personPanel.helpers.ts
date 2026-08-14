import type {
  AddChildInput,
  CreateIndividualInput,
  IndividualDetail,
  IndividualSummary,
  UpdateIndividualInput,
} from '../api'

export type PersonFormState = {
  firstName: string
  lastName: string
  namePrefix: string
  marriedName: string
  sex: string
  birthDate: string
  deathDate: string
  birthPlace: string
  deathPlace: string
  deathCause: string
  burialPlace: string
  occupation: string
  retirementNote: string
  email: string
  extraEvents: string
  biography: string
}

export type ChildFormState = {
  firstName: string
  lastName: string
  sex: string
  birthDate: string
}

export type RelativeFormState = {
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

export const EMPTY_RELATIVE: RelativeFormState = {
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
    namePrefix: toText(detail.namePrefix),
    marriedName: toText(detail.marriedName),
    sex: detail.sex ?? 'U',
    birthDate: toDateInput(detail.birthDate),
    deathDate: toDateInput(detail.deathDate),
    birthPlace: toText(detail.birthPlace),
    deathPlace: toText(detail.deathPlace),
    deathCause: toText(detail.deathCause),
    burialPlace: toText(detail.burialPlace),
    occupation: toText(detail.occupation),
    retirementNote: toText(detail.retirementNote),
    email: toText(detail.email),
    extraEvents: detail.extraEvents ?? '',
    biography: detail.biography ?? '',
  }
}

export function formatPersonName(
  person: Pick<IndividualSummary, 'firstName' | 'lastName'> & {
    middleName?: string
  },
): string {
  const parts = [
    person.firstName?.trim(),
    person.middleName?.trim(),
    person.lastName?.trim(),
  ].filter((p) => p && p.toLowerCase() !== 'unknown')
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
    namePrefix: toOptionalText(form.namePrefix),
    marriedName: toOptionalText(form.marriedName),
    sex: form.sex,
    birthDate: form.birthDate || null,
    deathDate: form.deathDate || null,
    birthPlace: toOptionalText(form.birthPlace),
    deathPlace: toOptionalText(form.deathPlace),
    deathCause: toOptionalText(form.deathCause),
    burialPlace: toOptionalText(form.burialPlace),
    occupation: toOptionalText(form.occupation),
    retirementNote: toOptionalText(form.retirementNote),
    email: toOptionalText(form.email),
    extraEvents: toOptionalText(form.extraEvents),
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

export function toRelativeInput(form: RelativeFormState): CreateIndividualInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    sex: form.sex,
    birthDate: form.birthDate || undefined,
  }
}
