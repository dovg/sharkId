import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getDiveSession, getSessionVideos, uploadPhoto, uploadVideo } from '../api'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import type { DiveSessionDetail as DSDetail, Photo, Video } from '../types'

export default function DiveSessionDetail() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<DSDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [videos, setVideos] = useState<Video[]>([])
  const [videoUploading, setVideoUploading] = useState(false)
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    getDiveSession(id)
      .then(setSession)
      .catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false))
    getSessionVideos(id).then(setVideos).catch(() => {})
  }, [id])

  // Poll video status while any video is still processing
  useEffect(() => {
    if (!id) return
    const active = videos.some(
      v => v.processing_status === 'uploaded' || v.processing_status === 'processing',
    )
    if (!active) return
    const timer = setInterval(() => {
      getSessionVideos(id).then(fresh => {
        setVideos(fresh)
        // If a video just finished, reload session to show new photos
        const wasDone = fresh.some(
          v => v.processing_status === 'done' &&
            videos.find(old => old.id === v.id)?.processing_status !== 'done',
        )
        if (wasDone) {
          getDiveSession(id).then(setSession).catch(() => {})
        }
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [id, videos])

  const handleFiles = async (files: FileList | null) => {
    if (!files || !id) return
    setUploading(true)
    const uploaded: Photo[] = []
    try {
      for (const file of Array.from(files)) {
        const photo = await uploadPhoto(id, file)
        uploaded.push(photo)
      }
      setSession(s =>
        s
          ? {
              ...s,
              photos: [...s.photos, ...uploaded],
              photo_count: s.photo_count + uploaded.length,
            }
          : s,
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleVideo = async (file: File | null) => {
    if (!file || !id) return
    setVideoUploading(true)
    setError('')
    try {
      const vid = await uploadVideo(id, file)
      setVideos(prev => [vid, ...prev])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Video upload failed')
    } finally {
      setVideoUploading(false)
      if (videoRef.current) videoRef.current.value = ''
    }
  }

  if (loading)
    return (
      <div className="app">
        <Sidebar />
        <div className="main">
          <div className="page-body">
            <div className="muted">Loading…</div>
          </div>
        </div>
      </div>
    )

  if (!session)
    return (
      <div className="app">
        <Sidebar />
        <div className="main">
          <div className="page-body">
            <div className="alert-error">{error || 'Session not found'}</div>
          </div>
        </div>
      </div>
    )

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <div className="breadcrumb">
              <Link to="/dive-sessions">Dive Sessions</Link> / Session Detail
            </div>
            <h1 className="page-title">Dive Session</h1>
          </div>
        </div>
        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          {/* Stats */}
          <div className="card mb16">
            <div className="card-body">
              <div className="stat-row">
                <div className="stat">
                  <span className="stat-val">
                    {new Date(session.started_at).toLocaleDateString('en')}
                  </span>
                  <span className="stat-lbl">Start</span>
                </div>
                <div className="stat">
                  <span className="stat-val">
                    {session.ended_at
                      ? new Date(session.ended_at).toLocaleDateString('en')
                      : '—'}
                  </span>
                  <span className="stat-lbl">End</span>
                </div>
                <div className="stat">
                  <span className="stat-val">{session.photo_count}</span>
                  <span className="stat-lbl">Photos</span>
                </div>
                <div className="stat">
                  <span className="stat-val">{session.observation_count}</span>
                  <span className="stat-lbl">Observations</span>
                </div>
              </div>
              {session.comment && (
                <div className="muted mt12">{session.comment}</div>
              )}
            </div>
          </div>

          {/* Upload */}
          <div className="card mb16">
            <div className="card-title">Upload Photos</div>
            <div
              className="dropzone"
              onDrop={e => {
                e.preventDefault()
                handleFiles(e.dataTransfer.files)
              }}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              {uploading
                ? 'Uploading…'
                : 'Drag & drop JPEG or PNG files here, or click to browse'}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              hidden
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* Video upload */}
          <div className="card mb16">
            <div className="card-title">Upload Video</div>
            <div className="card-body">
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Upload a dive video (MP4, MOV, WebM — max 500 MB). Frames containing sharks
                will be extracted automatically and added to the photo grid below.
              </p>
              <div className="flex-gap8">
                <button
                  className="btn btn-outline btn-sm"
                  disabled={videoUploading}
                  onClick={() => videoRef.current?.click()}
                >
                  {videoUploading ? 'Uploading…' : '🎬 Choose Video File'}
                </button>
              </div>
              <input
                ref={videoRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/avi,video/x-matroska"
                hidden
                onChange={e => handleVideo(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {/* Video list */}
          {videos.length > 0 && (
            <div className="card mb16">
              <div className="card-title">Videos ({videos.length})</div>
              <div className="video-list">
                {videos.map(v => {
                  const filename = v.object_key.split('/').pop() ?? v.object_key
                  const mb = (v.size / 1024 / 1024).toFixed(1)
                  return (
                    <div key={v.id} className="video-item">
                      <div className="video-item-icon">🎬</div>
                      <div className="video-item-info">
                        <div className="video-item-name">{filename}</div>
                        <div className="video-item-meta">
                          {mb} MB · {new Date(v.uploaded_at).toLocaleString('en')}
                        </div>
                      </div>
                      <div className="video-item-status">
                        <StatusBadge status={v.processing_status} />
                        {v.processing_status === 'done' && (
                          <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
                            {v.frames_extracted} frame{v.frames_extracted !== 1 ? 's' : ''} extracted
                          </span>
                        )}
                        {(v.processing_status === 'uploaded' || v.processing_status === 'processing') && (
                          <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>processing…</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Photos */}
          {session.photos.length > 0 && (
            <div className="card mb16">
              <div className="card-title">Photos ({session.photos.length})</div>
              <div className="photo-grid">
                {session.photos.map(p => (
                  <div key={p.id} className="photo-card">
                    <div
                      className="photo-thumb"
                      data-clickable=""
                      onClick={() => navigate(`/photos/${p.id}`)}
                    >
                      {p.url ? (
                        <img src={p.url} alt="" />
                      ) : (
                        '📷'
                      )}
                    </div>
                    <div className="photo-thumb-meta">
                      <StatusBadge status={p.processing_status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observations */}
          {session.observations.length > 0 && (
            <div className="card">
              <div className="card-title">Observations</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {session.observations.map(obs => (
                    <tr key={obs.id}>
                      <td>
                        {obs.taken_at
                          ? new Date(obs.taken_at).toLocaleString('en')
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge
                          status={obs.confirmed_at ? 'confirmed' : 'draft'}
                        />
                      </td>
                      <td>
                        <Link to={`/observations/${obs.id}`} className="link">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
