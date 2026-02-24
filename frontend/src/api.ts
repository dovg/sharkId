import type {
  BBox,
  DiveSession,
  DiveSessionDetail,
  Location,
  Observation,
  Orientation,
  Photo,
  Shark,
  SharkDetail,
} from './types'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

function getToken(): string | null {
  return localStorage.getItem('token')
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
  req<{ access_token: string; token_type: string }>('/auth/login', {
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

export const getPhoto = (id: string) => req<Photo>(`/photos/${id}`)

export const annotatePhoto = (
  id: string,
  data: { shark_bbox: BBox; zone_bbox: BBox; orientation: Orientation },
) => req<Photo>(`/photos/${id}/annotate`, { method: 'POST', body: JSON.stringify(data) })

export const getValidationQueue = () => req<Photo[]>('/photos/validation-queue')

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
    taken_at: string
    comment: string
    confirm: boolean
  }>,
) => req<Observation>(`/observations/${id}`, { method: 'PUT', body: JSON.stringify(data) })
