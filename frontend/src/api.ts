import type {
  AuditEvent,
  BBox,
  DiveSession,
  DiveSessionDetail,
  Location,
  Observation,
  Orientation,
  Photo,
  Role,
  Shark,
  SharkDetail,
  UserRecord,
  Video,
} from './types'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function download(path: string, filename: string): Promise<void> {
  const token = getToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const resp = await fetch(`${API_URL}${path}`, { headers })
  if (resp.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('email')
    window.location.href = '/login'
    return
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }))
    const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    throw new Error(msg)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const isFormData = init.body instanceof FormData
  const headers: Record<string, string> = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  }
  const resp = await fetch(`${API_URL}${path}`, { ...init, headers })
  // H4/H5: redirect to login on 401
  if (resp.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('email')
    window.location.href = '/login'
    return undefined as T
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }))
    const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
    throw new Error(msg)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  req<{ access_token: string; token_type: string; role: string; email: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const logout = () => req<void>('/auth/logout', { method: 'POST' })

// ── Locations ─────────────────────────────────────────────────────────────────
export const getLocations = () => req<Location[]>('/locations')

export const createLocation = (data: {
  country: string
  spot_name: string
  lat?: number
  lon?: number
}) => req<Location>('/locations', { method: 'POST', body: JSON.stringify(data) })

export const updateLocation = (
  id: string,
  data: Partial<{ country: string; spot_name: string; lat: number; lon: number }>,
) => req<Location>(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteLocation = (id: string) =>
  req<void>(`/locations/${id}`, { method: 'DELETE' })

// ── Dive Sessions ─────────────────────────────────────────────────────────────
export const getDiveSessions = () => req<DiveSession[]>('/dive-sessions')

export const getDiveSession = (id: string) =>
  req<DiveSessionDetail>(`/dive-sessions/${id}`)

export const createDiveSession = (data: {
  started_at: string
  ended_at?: string
  location_id?: string
  comment?: string
}) => req<DiveSession>('/dive-sessions', { method: 'POST', body: JSON.stringify(data) })

export const updateDiveSession = (
  id: string,
  data: Partial<{ started_at: string; ended_at: string; location_id: string; comment: string }>,
) => req<DiveSession>(`/dive-sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteDiveSession = (id: string) =>
  req<void>(`/dive-sessions/${id}`, { method: 'DELETE' })

// ── Photos ────────────────────────────────────────────────────────────────────
export const uploadPhoto = (sessionId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return req<Photo>(`/dive-sessions/${sessionId}/photos`, { method: 'POST', body: form })
}

export const uploadVideo = (sessionId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return req<Video>(`/dive-sessions/${sessionId}/videos`, { method: 'POST', body: form })
}

export const getSessionVideos = (sessionId: string) =>
  req<Video[]>(`/dive-sessions/${sessionId}/videos`)

export const deleteVideo = (sessionId: string, videoId: string) =>
  req<void>(`/dive-sessions/${sessionId}/videos/${videoId}`, { method: 'DELETE' })

export const getPhoto = (id: string) => req<Photo>(`/photos/${id}`)

export const deletePhoto = (id: string) => req<void>(`/photos/${id}`, { method: 'DELETE' })

export const annotatePhoto = (
  id: string,
  data: { shark_bbox: BBox; zone_bbox: BBox; orientation: Orientation },
) => req<Photo>(`/photos/${id}/annotate`, { method: 'POST', body: JSON.stringify(data) })

export const getValidationQueue = () => req<Photo[]>('/photos/validation-queue')
export const getUnlinkedPhotos = () => req<Photo[]>('/photos/unlinked')
export const getValidationQueueCount = () => req<{ count: number }>('/photos/validation-queue/count')

export const validatePhoto = (
  id: string,
  body: {
    action: string
    shark_id?: string
    shark_name?: string
    name_status?: string
    set_as_profile_photo?: boolean
  },
) => req<Photo>(`/photos/${id}/validate`, { method: 'POST', body: JSON.stringify(body) })

export const recheckPhoto = (id: string) =>
  req<Photo>(`/photos/${id}/recheck`, { method: 'POST' })

// ── Sharks ────────────────────────────────────────────────────────────────────
export const getSharks = () => req<Shark[]>('/sharks')

export const getShark = (id: string) => req<SharkDetail>(`/sharks/${id}`)

export const deleteShark = (id: string) => req<void>(`/sharks/${id}`, { method: 'DELETE' })

export const updateShark = (
  id: string,
  data: Partial<{ display_name: string; name_status: string; main_photo_id: string | null }>,
) => req<Shark>(`/sharks/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const suggestSharkName = () => req<{ name: string }>('/sharks/suggest-name')

// ── Observations ──────────────────────────────────────────────────────────────
export const getObservation = (id: string) => req<Observation>(`/observations/${id}`)

export const updateObservation = (
  id: string,
  data: Partial<{
    shark_id: string
    location_id: string
    dive_session_id: string
    taken_at: string
    comment: string
    confirm: boolean
  }>,
) => req<Observation>(`/observations/${id}`, { method: 'PUT', body: JSON.stringify(data) })

// ── Audit Log ──────────────────────────────────────────────────────────────────
export const getAuditLog = (params?: {
  resource_type?: string
  resource_id?: string
  limit?: number
  offset?: number
}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    )
  ).toString()
  return req<AuditEvent[]>(`/audit-log${qs ? `?${qs}` : ''}`)
}

// ── Users ──────────────────────────────────────────────────────────────────────
export const getMe = () => req<UserRecord>('/users/me')
export const getUsers = () => req<UserRecord[]>('/users')
export const createUser = (data: { email: string; password: string; role: Role }) =>
  req<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) })
export const updateUser = (id: string, data: Partial<{ email: string; password: string; role: Role }>) =>
  req<UserRecord>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteUser = (id: string) =>
  req<void>(`/users/${id}`, { method: 'DELETE' })

export const rebuildEmbeddings = () =>
  req<{ status: string }>('/photos/rebuild-embeddings', { method: 'POST' })

// ── Excel exports ──────────────────────────────────────────────────────────────
export const exportSharks = () => download('/sharks/export', 'sharks.xlsx')
export const exportShark = (id: string, name: string) =>
  download(`/sharks/${id}/export`, `shark_${name.replace(/\s+/g, '_')}.xlsx`)
export const exportSessions = () => download('/dive-sessions/export', 'dive_sessions.xlsx')
export const exportSession = (id: string, date: string) =>
  download(`/dive-sessions/${id}/export`, `session_${date}.xlsx`)

export const getMlStats = () =>
  req<{
    eligible_photos: number
    total_sharks: number
    last_rebuilt_at: string | null
    last_rebuilt_by: string | null
    ml_online: boolean
    embedding_count?: number
    indexed_sharks?: number
    embedding_dim?: number
  }>('/photos/ml-stats')
