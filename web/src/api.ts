const configuredApiUrl = (
  import.meta.env.VITE_API_URL as string | undefined
)?.replace(/\/$/, '')

/** Dev → localhost API; prod same-origin unless VITE_API_URL is set (Render split). */
const API_URL =
  configuredApiUrl !== undefined && configuredApiUrl !== ''
    ? configuredApiUrl
    : import.meta.env.DEV
      ? 'http://localhost:3000'
      : ''

const TOKEN_KEY = 'rodnik_token'
const TREE_ID_KEY = 'rodnik_treeId'
const USER_KEY = 'rodnik_user'

export type TreeRole = 'owner' | 'editor' | 'viewer'

function asTreeRole(value: unknown): TreeRole {
  if (value === 'owner' || value === 'editor' || value === 'viewer') return value
  return 'owner'
}

export interface AuthUser {
  userId: string
  email: string
  treeId: string
  treeName: string
  name: string
  role: TreeRole
}

export interface TreeSummary {
  id: string
  name: string
  role: TreeRole
}

export interface CreatedInvite {
  id: string
  token: string
  inviteUrl: string
  role: Exclude<TreeRole, 'owner'>
  expiresAt: string
}

export interface ListedInvite {
  id: string
  role: Exclude<TreeRole, 'owner'>
  expiresAt: string
  createdAt: string
}

export interface TreeMember {
  userId: string
  email: string
  name: string
  role: TreeRole
  joinedAt: string | null
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
}

export interface IndividualNode {
  id: string
  gedcomId?: string
  firstName?: string
  lastName?: string
  middleName?: string
  sex?: string
  birthDate?: string
  deathDate?: string
  avatarUrl?: string
  avatarMediaId?: string
}

export interface IndividualSummary {
  id: string
  firstName?: string
  lastName?: string
  sex?: string
  birthDate?: string
  deathDate?: string
  avatarUrl?: string
  avatarMediaId?: string
}

export interface IndividualDetail extends IndividualNode {
  birthPlace?: string
  deathPlace?: string
  deathCause?: string
  burialPlace?: string
  biography?: string
  occupation?: string
  retirementNote?: string
  email?: string
  namePrefix?: string
  marriedName?: string
  extraEvents?: string
  relatives?: {
    parents: IndividualSummary[]
    spouses: IndividualSummary[]
    children: IndividualSummary[]
  }
}

export interface UploadedMedia {
  id: string
  url: string
  thumbnailUrl?: string
}

export interface UpdateIndividualInput {
  firstName?: string
  lastName?: string
  sex?: string
  birthDate?: string | null
  deathDate?: string | null
  birthPlace?: string | null
  deathPlace?: string | null
  deathCause?: string | null
  burialPlace?: string | null
  occupation?: string | null
  retirementNote?: string | null
  email?: string | null
  namePrefix?: string | null
  marriedName?: string | null
  extraEvents?: string | null
  biography?: string | null
}

export interface CreateIndividualInput {
  firstName: string
  lastName: string
  sex: string
  birthDate?: string
}

export interface AddChildInput {
  firstName: string
  lastName: string
  sex: string
  birthDate?: string
  deathDate?: string
  birthPlace?: string
  deathPlace?: string
  biography?: string
}

export type RelationshipType = 'PARENT' | 'CHILD' | 'SPOUSE'

export interface CreateRelationshipInput {
  fromIndividualId: string
  toIndividualId: string
  relationshipType: RelationshipType
}

export interface TreeRelationship {
  source: string
  target: string
  type: string
  familyId: string
}

export interface VisualizeResponse {
  nodes: IndividualNode[]
  relationships: TreeRelationship[]
}

export interface FullGraphResponse {
  nodes: IndividualNode[]
  relationships: TreeRelationship[]
  rootId: string | null
  componentCount: number
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getTreeId(): string | null {
  return localStorage.getItem(TREE_ID_KEY)
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthUser
    return { ...parsed, role: asTreeRole(parsed.role) }
  } catch {
    return null
  }
}

export function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TREE_ID_KEY, user.treeId)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TREE_ID_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

export async function getMe(): Promise<AuthUser> {
  const data = await request<AuthUser>('/auth/me')
  return { ...data, role: asTreeRole(data.role) }
}

export async function refreshSessionUser(): Promise<AuthUser | null> {
  const token = getToken()
  if (!token) return null
  const me = await getMe()
  const stored = getStoredUser()
  if (
    !stored ||
    stored.treeId !== me.treeId ||
    stored.role !== me.role ||
    stored.treeName !== me.treeName
  ) {
    saveAuth(token, me)
  }
  return me
}

export function canWriteTree(user: AuthUser | null = getStoredUser()): boolean {
  return user?.role !== 'viewer'
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string | string[] }
    if (Array.isArray(data.message)) return data.message.join(', ')
    if (typeof data.message === 'string') return data.message
  } catch {
    /* ignore */
  }
  return res.statusText || 'Request failed'
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers)

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  }).catch(() => {
    throw new ApiError(
      0,
      `Не удалось связаться с API (${API_URL}). Проверьте, что сервер запущен.`,
    )
  })

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res))
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function normalizeAuth(data: Record<string, unknown>): AuthResponse {
  const accessToken =
    (data.accessToken as string | undefined) ||
    (data.access_token as string | undefined) ||
    (data.token as string | undefined)

  const nested = data.user as AuthUser | undefined
  const user: AuthUser = nested
    ? { ...nested, role: asTreeRole(nested.role) }
    : {
        userId: String(data.userId ?? data.sub ?? ''),
        email: String(data.email ?? ''),
        treeId: String(data.treeId ?? ''),
        treeName: String(data.treeName ?? 'Моё древо'),
        name: String(data.name ?? ''),
        role: asTreeRole(data.role),
      }

  if (!accessToken) {
    throw new ApiError(500, 'Auth response missing access token')
  }

  return { accessToken, user }
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await request<Record<string, unknown>>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false,
  )
  return normalizeAuth(data)
}

export async function register(input: {
  email: string
  password: string
  name: string
  treeName?: string
}): Promise<AuthResponse> {
  const data = await request<Record<string, unknown>>(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    false,
  )
  return normalizeAuth(data)
}

export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  return request<{ message: string }>(
    '/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
    false,
  )
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<{ message: string }> {
  return request<{ message: string }>(
    '/auth/reset-password',
    {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    },
    false,
  )
}

export async function visualizeTree(
  rootId: string,
  depth = 3,
): Promise<VisualizeResponse> {
  return request<VisualizeResponse>(
    `/family-tree/visualize/${encodeURIComponent(rootId)}?depth=${depth}`,
  )
}

export async function getFullGraph(): Promise<FullGraphResponse> {
  return request<FullGraphResponse>('/family-tree/graph')
}

export async function searchIndividuals(
  q = '',
  limit = 20,
): Promise<IndividualNode[]> {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  params.set('limit', String(limit))
  return request<IndividualNode[]>(`/family-tree/individuals?${params}`)
}

export async function createIndividual(
  input: CreateIndividualInput,
): Promise<IndividualNode> {
  return request<IndividualNode>('/family-tree/individuals', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createRelationship(
  input: CreateRelationshipInput,
): Promise<boolean> {
  return request<boolean>('/family-tree/relationships', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getIndividual(id: string): Promise<IndividualDetail> {
  return request<IndividualDetail>(
    `/family-tree/individuals/${encodeURIComponent(id)}`,
  )
}

export async function updateIndividual(
  id: string,
  input: UpdateIndividualInput,
): Promise<IndividualDetail> {
  return request<IndividualDetail>(
    `/family-tree/individuals/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function addChild(
  parentId: string,
  input: AddChildInput,
): Promise<{ child: IndividualDetail; linkedParentIds: string[] }> {
  return request(
    `/family-tree/individuals/${encodeURIComponent(parentId)}/children`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function uploadIndividualMedia(
  individualId: string,
  file: File,
): Promise<UploadedMedia> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedMedia>(
    `/family-tree/individuals/${encodeURIComponent(individualId)}/media`,
    {
      method: 'POST',
      body: form,
    },
  )
}

export async function deleteMedia(mediaId: string): Promise<void> {
  return request<void>(`/family-tree/media/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
  })
}

export async function listTrees(): Promise<TreeSummary[]> {
  return request<TreeSummary[]>('/trees')
}

export async function switchTree(treeId: string): Promise<AuthResponse> {
  const data = await request<Record<string, unknown>>(
    `/trees/${encodeURIComponent(treeId)}/switch`,
    { method: 'POST' },
  )
  return normalizeAuth(data)
}

export async function createInvite(
  treeId: string,
  role: Exclude<TreeRole, 'owner'>,
  expiresInDays?: number,
): Promise<CreatedInvite> {
  return request<CreatedInvite>(
    `/trees/${encodeURIComponent(treeId)}/invites`,
    {
      method: 'POST',
      body: JSON.stringify({ role, expiresInDays }),
    },
  )
}

export async function listInvites(treeId: string): Promise<ListedInvite[]> {
  return request<ListedInvite[]>(
    `/trees/${encodeURIComponent(treeId)}/invites`,
  )
}

export async function revokeInvite(
  treeId: string,
  inviteId: string,
): Promise<void> {
  return request<void>(
    `/trees/${encodeURIComponent(treeId)}/invites/${encodeURIComponent(inviteId)}`,
    { method: 'DELETE' },
  )
}

export async function listMembers(treeId: string): Promise<TreeMember[]> {
  return request<TreeMember[]>(
    `/trees/${encodeURIComponent(treeId)}/members`,
  )
}

export async function removeMember(
  treeId: string,
  userId: string,
): Promise<void> {
  return request<void>(
    `/trees/${encodeURIComponent(treeId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  )
}

export async function acceptInvite(token: string): Promise<AuthResponse> {
  const data = await request<Record<string, unknown>>(
    `/invites/${encodeURIComponent(token)}/accept`,
    { method: 'POST' },
  )
  return normalizeAuth(data)
}

export async function importGedcom(file: File): Promise<unknown> {
  const form = new FormData()
  form.append('file', file)
  form.append('source', 'web')
  return request('/family-tree/import/gedcom', {
    method: 'POST',
    body: form,
  })
}

export async function exportGedcom(
  filename = 'family-tree.ged',
): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_URL}/family-tree/export/gedcom`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {
    throw new ApiError(0, `Не удалось связаться с API (${API_URL}).`)
  })

  if (!res.ok) {
    const message = (await res.text().catch(() => '')) || res.statusText
    throw new ApiError(res.status, message || 'Экспорт не удался')
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export { API_URL }
