import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createInvite,
  getStoredUser,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  type CreatedInvite,
  type ListedInvite,
  type TreeMember,
  type TreeRole,
} from '../api'
import { AppNav } from '../components/AppNav'
import './AccessPage.css'

const ROLE_LABEL: Record<TreeRole, string> = {
  owner: 'Владелец',
  editor: 'Редактор',
  viewer: 'Наблюдатель',
}

function toCopyUrl(inviteUrl: string): string {
  if (inviteUrl.startsWith('http://') || inviteUrl.startsWith('https://')) {
    return inviteUrl
  }
  return `${window.location.origin}${inviteUrl.startsWith('/') ? '' : '/'}${inviteUrl}`
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

export function AccessPage() {
  const user = getStoredUser()
  const treeId = user?.treeId
  const [invites, setInvites] = useState<ListedInvite[]>([])
  const [members, setMembers] = useState<TreeMember[]>([])
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer')
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!treeId || user?.role !== 'owner') return
    let cancelled = false
    setError(null)
    Promise.all([listInvites(treeId), listMembers(treeId)])
      .then(([nextInvites, nextMembers]) => {
        if (cancelled) return
        setInvites(nextInvites)
        setMembers(nextMembers)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Не удалось загрузить доступ')
        }
      })
    return () => {
      cancelled = true
    }
  }, [treeId, user?.role])

  async function refresh() {
    if (!treeId) return
    const [nextInvites, nextMembers] = await Promise.all([
      listInvites(treeId),
      listMembers(treeId),
    ])
    setInvites(nextInvites)
    setMembers(nextMembers)
  }

  if (user?.role !== 'owner' || !treeId) {
    return (
      <div className="app-shell">
        <AppNav />
        <main className="page fade-in">
          <p className="eyebrow">Доступ</p>
          <h1 className="brand">Приглашения</h1>
          <p className="error">Управлять доступом может только владелец древа.</p>
        </main>
      </div>
    )
  }

  const activeTreeId = treeId

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setCopied(false)
    try {
      const invite = await createInvite(activeTreeId, role)
      setCreated(invite)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать приглашение')
    } finally {
      setPending(false)
    }
  }

  async function onCopy() {
    if (!created) return
    const url = toCopyUrl(created.inviteUrl)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function onRevoke(inviteId: string) {
    setError(null)
    try {
      await revokeInvite(activeTreeId, inviteId)
      if (created?.id === inviteId) setCreated(null)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отозвать приглашение')
    }
  }

  async function onKick(memberUserId: string) {
    setError(null)
    try {
      await removeMember(activeTreeId, memberUserId)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить участника')
    }
  }

  const copyUrl = created ? toCopyUrl(created.inviteUrl) : ''

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page fade-in">
        <p className="eyebrow">Доступ</p>
        <h1 className="brand">Приглашения</h1>
        <p className="lede">
          Создайте ссылку для редактора или наблюдателя, отзовите её или уберите
          участника из текущего древа.
        </p>

        <form className="access-panel panel" onSubmit={(event) => void onCreate(event)}>
          <div className="field">
            <label htmlFor="invite-role">Роль приглашения</label>
            <select
              id="invite-role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value === 'editor' ? 'editor' : 'viewer')
              }
            >
              <option value="viewer">Наблюдатель</option>
              <option value="editor">Редактор</option>
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={pending}>
            {pending ? 'Создаём…' : 'Создать ссылку'}
          </button>
        </form>

        {created && (
          <section className="access-panel panel">
            <h2 className="access-title">Новая ссылка</h2>
            <p className="muted">
              {ROLE_LABEL[created.role]} · до {formatWhen(created.expiresAt)}
            </p>
            <div className="access-copy-row">
              <input readOnly value={copyUrl} aria-label="Ссылка-приглашение" />
              <button type="button" className="btn" onClick={() => void onCopy()}>
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </section>
        )}

        <section className="access-panel panel">
          <h2 className="access-title">Активные приглашения</h2>
          {invites.length === 0 ? (
            <p className="muted">Нет активных ссылок.</p>
          ) : (
            <ul className="access-list">
              {invites.map((invite) => (
                <li key={invite.id} className="access-row">
                  <span>
                    {ROLE_LABEL[invite.role]} · до {formatWhen(invite.expiresAt)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void onRevoke(invite.id)}
                  >
                    Отозвать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="access-panel panel">
          <h2 className="access-title">Участники</h2>
          {members.length === 0 ? (
            <p className="muted">Пока никого нет.</p>
          ) : (
            <ul className="access-list">
              {members.map((member) => (
                <li key={member.userId} className="access-row">
                  <span>
                    {member.name || member.email} · {ROLE_LABEL[member.role]}
                  </span>
                  {member.role !== 'owner' && member.userId !== user.userId && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void onKick(member.userId)}
                    >
                      Удалить
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
