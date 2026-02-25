import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getDiveSessions, getLocations, getObservation, getPhoto, getSharks, updateObservation } from '../api'
import { useAuth } from '../auth'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import { usePageTitle } from '../hooks'
import type { DiveSession, Location, Observation, Photo, Shark } from '../types'

export default function ObservationDetail() {
  usePageTitle('Observation')
  const { id } = useParams<{ id: string }>()
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [obs, setObs] = useState<Observation | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [sharks, setSharks] = useState<Shark[]>([])
  const [sessions, setSessions] = useState<DiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [exifOpen, setExifOpen] = useState(false)
  const [form, setForm] = useState({
    shark_id: '',
    location_id: '',
    dive_session_id: '',
    taken_at: '',
    comment: '',
  })

  useEffect(() => {
    if (!id) return
    Promise.all([getObservation(id), getLocations(), getSharks(), getDiveSessions()])
      .then(([o, l, s, d]) => {
        setObs(o)
        setLocations(l)
        setSharks(s)
        setSessions(d)
        setForm({
          shark_id: o.shark_id ?? '',
          location_id: o.location_id ?? '',
          dive_session_id: o.dive_session_id ?? '',
          taken_at: o.taken_at ? o.taken_at.slice(0, 16) : '',
          comment: o.comment ?? '',
        })
        if (o.photo_id) getPhoto(o.photo_id).then(setPhoto).catch(() => {})
      })
      .catch(() => setError('Failed to load observation'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!obs) return
    setSaving(true)
    try {
      const body: Parameters<typeof updateObservation>[1] = {}
      if (form.shark_id) body.shark_id = form.shark_id
      if (form.location_id) body.location_id = form.location_id
      if (form.dive_session_id) body.dive_session_id = form.dive_session_id
      if (form.taken_at) body.taken_at = new Date(form.taken_at).toISOString()
      body.comment = form.comment
      const updated = await updateObservation(obs.id, body)
      setObs(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!obs) return
    setSaving(true)
    try {
      const updated = await updateObservation(obs.id, { confirm: true })
      setObs(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Confirm failed')
    } finally {
      setSaving(false)
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

  if (!obs)
    return (
      <div className="app">
        <Sidebar />
        <div className="main">
          <div className="page-body">
            <div className="alert-error">{error || 'Observation not found'}</div>
          </div>
        </div>
      </div>
    )

  const isConfirmed = !!obs.confirmed_at
  const isReadOnly = isConfirmed || !canEdit
  const locMap = Object.fromEntries(locations.map(l => [l.id, l]))
  const exifEntries = obs.exif_payload ? Object.entries(obs.exif_payload).filter(([k]) => k !== 'GPSInfo') : []

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <div className="breadcrumb">
              {obs.dive_session_id && (
                <>
                  <Link to={`/dive-sessions/${obs.dive_session_id}`}>Session</Link>
                  {' / '}
                </>
              )}
              Observation
            </div>
            <h1 className="page-title">Observation Detail</h1>
          </div>
          <StatusBadge status={isConfirmed ? 'confirmed' : 'draft'} />
        </div>

        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          <div className="grid2">
            {/* Left: photo + info links */}
            <div className="card">
              <div className="card-body">
                {photo?.url ? (
                  <div className="annot-photo-wrap mb16">
                    <img src={photo.url} alt="" draggable={false} />
                    {photo.shark_bbox && photo.zone_bbox && (
                      <svg
                        className="annot-svg"
                        viewBox="0 0 1 1"
                        preserveAspectRatio="none"
                        style={{ cursor: 'default', pointerEvents: 'none' }}
                      >
                        <rect
                          x={photo.shark_bbox.x} y={photo.shark_bbox.y}
                          width={photo.shark_bbox.w} height={photo.shark_bbox.h}
                          fill="rgba(13,158,147,0.15)" stroke="#0d9e93" strokeWidth="0.003"
                        />
                        <rect
                          x={photo.shark_bbox.x + photo.zone_bbox.x * photo.shark_bbox.w}
                          y={photo.shark_bbox.y + photo.zone_bbox.y * photo.shark_bbox.h}
                          width={photo.zone_bbox.w * photo.shark_bbox.w}
                          height={photo.zone_bbox.h * photo.shark_bbox.h}
                          fill="rgba(255,140,0,0.15)" stroke="#ff8c00" strokeWidth="0.003"
                        />
                      </svg>
                    )}
                  </div>
                ) : (
                  <div className="photo-preview-box mb16">📷</div>
                )}
                {photo && canEdit && (
                  <div className="mb16">
                    <Link to={`/photos/${photo.id}`} className="btn btn-outline btn-sm">
                      Edit Photo Annotation
                    </Link>
                  </div>
                )}
                <div className="exif-table">
                  <div className="exif-row">
                    <span className="exif-key">Shark</span>
                    <span>
                      {obs.shark_id ? (
                        <Link to={`/sharks/${obs.shark_id}`} className="link">
                          View shark
                        </Link>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className="exif-row">
                    <span className="exif-key">Session</span>
                    <span>
                      {obs.dive_session_id ? (
                        <Link
                          to={`/dive-sessions/${obs.dive_session_id}`}
                          className="link"
                        >
                          View session
                        </Link>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className="exif-row">
                    <span className="exif-key">Location</span>
                    <span>
                      {obs.location_id && locMap[obs.location_id]
                        ? `${locMap[obs.location_id].spot_name}, ${locMap[obs.location_id].country}`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Req8: collapsible EXIF panel */}
                {exifEntries.length > 0 && (
                  <div className="mt16">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExifOpen(v => !v)}
                      style={{ fontSize: 12 }}
                    >
                      {exifOpen ? '▲ Hide EXIF data' : '▼ Show EXIF data'}
                    </button>
                    {exifOpen && (
                      <div className="exif-table mt8" style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {exifEntries.map(([k, v]) => (
                          <div key={k} className="exif-row">
                            <span className="exif-key" style={{ fontSize: 11 }}>{k}</span>
                            <span style={{ fontSize: 11, wordBreak: 'break-all' }}>
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: editable form */}
            <div className="card">
              <div className="card-body">
                <div className="card-title" style={{ padding: 0, marginBottom: 16 }}>
                  Details
                </div>

                {/* Req6: shark selector */}
                <div className="form-group">
                  <label className="form-label">Shark</label>
                  <select
                    value={form.shark_id}
                    onChange={e => setForm(f => ({ ...f, shark_id: e.target.value }))}
                    disabled={isReadOnly}
                  >
                    <option value="">— Not identified —</option>
                    {sharks.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.display_name} ({s.name_status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Req9: session selector */}
                <div className="form-group">
                  <label className="form-label">Dive Session</label>
                  <select
                    value={form.dive_session_id}
                    onChange={e => setForm(f => ({ ...f, dive_session_id: e.target.value }))}
                    disabled={isReadOnly}
                  >
                    <option value="">— No session —</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.started_at).toLocaleDateString('en')}
                        {s.comment ? ` — ${s.comment}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={form.taken_at}
                    onChange={e => setForm(f => ({ ...f, taken_at: e.target.value }))}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <select
                    value={form.location_id}
                    onChange={e =>
                      setForm(f => ({ ...f, location_id: e.target.value }))
                    }
                    disabled={isReadOnly}
                  >
                    <option value="">— No location —</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.spot_name}, {l.country}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Comment</label>
                  <textarea
                    rows={3}
                    value={form.comment}
                    onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                    disabled={isReadOnly}
                  />
                </div>

                {isConfirmed ? (
                  <div className="confirmed-banner">
                    ✓ Confirmed on{' '}
                    {new Date(obs.confirmed_at!).toLocaleString('en')}
                  </div>
                ) : canEdit ? (
                  <div className="flex-gap8">
                    <button
                      className="btn btn-outline"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      Save Draft
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={handleConfirm}
                      disabled={saving}
                    >
                      Confirm Observation
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
