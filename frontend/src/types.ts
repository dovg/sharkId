export type Role = 'admin' | 'editor' | 'viewer'

export interface UserRecord {
  id: string
  email: string
  role: Role
  created_at: string
}

export type NameStatus = 'temporary' | 'confirmed'
export type Orientation = 'face_left' | 'face_right'

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export type ProcessingStatus =
  | 'uploaded'
  | 'processing'
  | 'ready_for_validation'
  | 'validated'
  | 'error'

export interface Location {
  id: string
  country: string
  spot_name: string
  lat: number | null
  lon: number | null
  created_at: string
}

export interface Candidate {
  shark_id: string
  display_name: string
  score: number
}

export interface Photo {
  id: string
  object_key: string
  content_type: string
  size: number
  uploaded_at: string
  taken_at: string | null
  gps_lat: number | null
  gps_lon: number | null
  processing_status: ProcessingStatus
  top5_candidates: Candidate[] | null
  dive_session_id: string | null
  shark_id: string | null
  is_profile_photo: boolean
  shark_bbox: BBox | null
  zone_bbox: BBox | null
  orientation: Orientation | null
  auto_detected: boolean
  url: string | null
}

export interface Observation {
  id: string
  dive_session_id: string
  shark_id: string | null
  photo_id: string | null
  location_id: string | null
  taken_at: string | null
  comment: string | null
  confirmed_at: string | null
  created_at: string
  exif_payload: Record<string, unknown> | null
}

export interface DiveSession {
  id: string
  started_at: string
  ended_at: string | null
  location_id: string | null
  comment: string | null
  created_at: string
  shark_count: number
  queue_count: number
  shark_thumbs: string[]
}

export interface DiveSessionDetail extends DiveSession {
  photo_count: number
  observation_count: number
  photos: Photo[]
  observations: Observation[]
}

export type VideoStatus = 'uploaded' | 'processing' | 'done' | 'error'

export interface Video {
  id: string
  object_key: string
  content_type: string
  size: number
  uploaded_at: string
  processing_status: VideoStatus
  frames_extracted: number
  dive_session_id: string | null
}

export interface Shark {
  id: string
  display_name: string
  name_status: NameStatus
  created_at: string
  main_photo_id: string | null
  main_photo_url: string | null
}

export interface SharkDetail extends Shark {
  profile_photos: Photo[]
  all_photos: Photo[]
  observations: Observation[]
  sighting_count: number
  first_seen: string | null
  last_seen: string | null
}

export interface AuditEvent {
  id: string
  user_id: string | null
  user_email: string
  action: string
  resource_type: string | null
  resource_id: string | null
  detail: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}
