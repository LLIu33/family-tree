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

export interface AuthUser {
  userId: string
  email: string
  treeId: string
  treeName: string
  name: string
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
}

export interface IndividualSummary {
  id: string
  firstName?: string
  lastName?: string
  sex?: string
  birthDate?: string
  deathDate?: string
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
    return JSON.parse(raw) as AuthUser
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
  const user: AuthUser = nested ?? {
    userId: String(data.userId ?? data.sub ?? ''),
    email: String(data.email ?? ''),
    treeId: String(data.treeId ?? ''),
    treeName: String(data.treeName ?? 'Моё древо'),
    name: String(data.name ?? ''),
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

export async function importGedcom(file: File): Promise<unknown> {
  const form = new FormData()
  form.append('file', file)
  form.append('source', 'web')
  return request('/family-tree/import/gedcom', {
    method: 'POST',
    body: form,
  })
}

export { API_URL }
