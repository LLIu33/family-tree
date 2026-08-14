import type { CreateIndividualInput } from '../api'

export type CreatePersonFormState = {
  firstName: string
  lastName: string
  sex: string
  birthDate: string
}

export const EMPTY_CREATE_PERSON: CreatePersonFormState = {
  firstName: '',
  lastName: '',
  sex: 'U',
  birthDate: '',
}

export function toCreateIndividualInput(
  form: CreatePersonFormState,
): CreateIndividualInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    sex: form.sex,
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
  }
}

export function validateCreatePersonForm(
  form: CreatePersonFormState,
): string | null {
  if (form.firstName.trim().length < 2) return 'Имя: минимум 2 символа'
  if (form.lastName.trim().length < 2) return 'Фамилия: минимум 2 символа'
  return null
}
