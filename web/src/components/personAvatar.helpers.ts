export type AvatarSex = 'M' | 'F' | 'U'

export type AvatarPerson = {
  firstName?: string
  lastName?: string
  sex?: string
  avatarUrl?: string
}

function meaningfulPart(value?: string): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return ''
  return trimmed
}

/** First grapheme-ish letter; keep simple (charAt) for Cyrillic + Latin. */
function firstLetter(value: string): string {
  return value.charAt(0).toLocaleUpperCase('ru-RU')
}

export function normalizeSex(sex?: string): AvatarSex {
  const s = (sex ?? '').trim().toUpperCase()
  if (s === 'M' || s === 'MALE') return 'M'
  if (s === 'F' || s === 'FEMALE') return 'F'
  return 'U'
}

/**
 * Prefer first+last initials; if only one name part, one letter;
 * if none, '?'.
 */
export function getPersonInitials(person: AvatarPerson): string {
  const first = meaningfulPart(person.firstName)
  const last = meaningfulPart(person.lastName)
  if (first && last) return `${firstLetter(first)}${firstLetter(last)}`
  if (first) return firstLetter(first)
  if (last) return firstLetter(last)
  return '?'
}

export function avatarToneClass(sex?: string): 'avatar--m' | 'avatar--f' | 'avatar--u' {
  const n = normalizeSex(sex)
  if (n === 'M') return 'avatar--m'
  if (n === 'F') return 'avatar--f'
  return 'avatar--u'
}
