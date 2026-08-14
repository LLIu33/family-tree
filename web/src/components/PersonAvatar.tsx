import { useEffect, useState } from 'react'
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
  const [imgFailed, setImgFailed] = useState(false)
  const initials = getPersonInitials(person)
  const tone = avatarToneClass(person.sex)
  const classes = ['avatar', `avatar--${size}`, tone, className]
    .filter(Boolean)
    .join(' ')
  const showImage = Boolean(person.avatarUrl) && !imgFailed

  useEffect(() => {
    setImgFailed(false)
  }, [person.avatarUrl])

  return (
    <span className={classes} aria-hidden="true" title={initials}>
      {showImage ? (
        <img
          className="avatar__img"
          src={person.avatarUrl}
          alt=""
          onError={() => setImgFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
