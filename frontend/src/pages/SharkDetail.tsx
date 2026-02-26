import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteShark, exportShark, getAuditLog, getMlStats, getShark, updateShark } from '../api'
import { useAuth } from '../auth'
import { EventHistory } from '../components/EventHistory'
import { Lightbox } from '../components/Lightbox'
import { Modal } from '../components/Modal'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import { usePageTitle } from '../hooks'
import type { AuditEvent, SharkDetail as SharkDetailType } from '../types'

export default function SharkDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [shark, setShark] = useState<SharkDetailType | null>(null)
  usePageTitle(shark?.display_name ?? undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showRename, setShowRename] = useState(false)
  const [renameForm, setRenameForm] = useState({
    display_name: '',
    name_status: 'temporary',
  })
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [embeddingCount, setEmbeddingCount] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    getShark(id)
      .then(s => {
        setShark(s)
        setRenameForm({ display_name: s.display_name, name_status: s.name_status })
      })
      .catch(() => setError('Failed to load shark'))
      .finally(() => setLoading(false))
    getAuditLog({ resource_type: 'shark', resource_id: id })
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false))
    getMlStats()
      .then(stats => setEmbeddingCount(stats.by_shark?.[id] ?? 0))
      .catch(() => {})
  }, [id])

  const handleSetMain = async (photoId: string) => {
    if (!shark) return
    try {
      const updated = await updateShark(shark.id, { main_photo_id: photoId })
      setShark(s => s ? { ...s, main_photo_id: updated.main_photo_id, main_photo_url: updated.main_photo_url } : s)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set main photo')
    }
  }

  const handleRename = async () => {
    if (!shark) return
    try {
      const updated = await updateShark(shark.id, renameForm)
      setShark(s => (s ? { ...s, ...updated } : s))
      setShowRename(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename')
    }
  }

  if (loading)
    return (
      <div className="app">
        <Sidebar />
        <div className="main">
          <div className="page-body"><div className="muted">Loading…</div></div>
        </div>
      </div>
    )

  if (!shark)
    return (
      <div className="app">
        <Sidebar />
        <div className="main">
          <div className="page-body">
            <div className="alert-error">{error || 'Shark not found'}</div>
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
              <Link to="/sharks">Shark Catalog</Link> / {shark.display_name}
            </div>
            <h1 className="page-title">{shark.display_name}</h1>
          </div>
          {canEdit && (
            <div className="flex-gap8">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => exportShark(shark.id, shark.display_name).catch(() => {})}
              >
                Export Excel
              </button>
              <button className="btn btn-outline" onClick={() => setShowRename(true)}>
                Rename
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!shark) return
                  if (!window.confirm(`Delete "${shark.display_name}"? Photos and observations will be unlinked.`)) return
                  try {
                    await deleteShark(shark.id)
                    navigate('/sharks')
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : 'Failed to delete')
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          {/* Profile card */}
          <div className="card mb16">
            <div className="profile-header">
              <div className="profile-avatar">
                {shark.main_photo_url
                  ? <img src={shark.main_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  : '🦈'}
              </div>
              <div style={{ flex: 1 }}>
                <div className="flex-gap8 mb8">
                  <StatusBadge status={shark.name_status} />
                </div>
                <div className="stat-row">
                  <div className="stat">
                    <span className="stat-val">{shark.sighting_count}</span>
                    <span className="stat-lbl">Sightings</span>
                  </div>
                  <div className="stat">
                    <span className="stat-val">{shark.all_photos.length}</span>
                    <span className="stat-lbl">Photos</span>
                  </div>
                  <div className="stat">
                    <span className="stat-val">{embeddingCount ?? '—'}</span>
                    <span className="stat-lbl">In Model</span>
                  </div>
                  <div className="stat">
                    <span className="stat-val">
                      {shark.first_seen
                        ? new Date(shark.first_seen).toLocaleDateString('en')
                        : '—'}
                    </span>
                    <span className="stat-lbl">First Seen</span>
                  </div>
                  <div className="stat">
                    <span className="stat-val">
                      {shark.last_seen
                        ? new Date(shark.last_seen).toLocaleDateString('en')
                        : '—'}
                    </span>
                    <span className="stat-lbl">Last Seen</span>
                  </div>
                </div>
              </div>
            </div>

            {shark.all_photos.length > 0 && (
              <div className="profile-photos-strip">
                {shark.all_photos.map(p => (
                  <div
                    key={p.id}
                    className={`strip-photo${p.id === shark.main_photo_id ? ' primary' : ''}`}
                    data-clickable=""
                    onClick={() => p.url && setLightboxIndex(shark.all_photos.indexOf(p))}
                  >
                    {p.url ? <img src={p.url} alt="" /> : '📷'}
                    {canEdit && (
                      <button
                        className="strip-set-main"
                        title="Set as main photo"
                        onClick={e => { e.stopPropagation(); handleSetMain(p.id) }}
                      >
                        ★
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observation timeline */}
          {shark.observations.length > 0 && (
            <div className="card">
              <div className="card-title">Observation History</div>
              <ul className="timeline">
                {shark.observations.map(obs => (
                  <li key={obs.id} className="tl-item">
                    <div className="tl-dot">🔍</div>
                    <div className="tl-content">
                      <div className="tl-meta">
                        {obs.taken_at
                          ? new Date(obs.taken_at).toLocaleString('en')
                          : '—'}
                      </div>
                      <div className="flex-gap8 mb4">
                        <StatusBadge
                          status={obs.confirmed_at ? 'confirmed' : 'draft'}
                        />
                        {obs.comment && (
                          <span className="muted">{obs.comment}</span>
                        )}
                      </div>
                      <Link to={`/observations/${obs.id}`} className="link">
                        View observation
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shark.observations.length === 0 && (
            <div className="empty-state">No observations recorded yet.</div>
          )}

          {/* Event History */}
          <div className="mt16">
            <EventHistory events={events} loading={eventsLoading} />
          </div>
        </div>
      </div>

      {lightboxIndex !== null && shark.all_photos[lightboxIndex]?.url && (
        <Lightbox
          url={shark.all_photos[lightboxIndex].url!}
          onClose={() => setLightboxIndex(null)}
          onPrev={lightboxIndex > 0 ? () => setLightboxIndex(i => i! - 1) : undefined}
          onNext={lightboxIndex < shark.all_photos.length - 1 ? () => setLightboxIndex(i => i! + 1) : undefined}
        />
      )}

      {showRename && (
        <Modal title="Rename Shark" onClose={() => setShowRename(false)}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              value={renameForm.display_name}
              onChange={e =>
                setRenameForm(f => ({ ...f, display_name: e.target.value }))
              }
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Name Status</label>
            <select
              value={renameForm.name_status}
              onChange={e =>
                setRenameForm(f => ({ ...f, name_status: e.target.value }))
              }
            >
              <option value="temporary">Temporary</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>
          <div className="flex-gap8 mt16">
            <button className="btn btn-primary" onClick={handleRename}>
              Save Changes
            </button>
            <button className="btn btn-outline" onClick={() => setShowRename(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
