import {
  avatarToneClass,
  getPersonInitials,
  type AvatarPerson,
} from './personAvatar.helpers'
import './PersonAvatar.css'

type Props = {
  person: AvatarPerson
  size?: 'sm' | 'md'
  className?: string
}

export function PersonAvatar({ person, size = 'sm', className = '' }: Props) {
  const initials = getPersonInitials(person)
  const tone = avatarToneClass(person.sex)
  const classes = ['avatar', `avatar--${size}`, tone, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true" title={initials}>
      {initials}
    </span>
  )
}
