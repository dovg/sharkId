import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getLocations, getObservation, updateObservation } from '../api'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import type { Location, Observation } from '../types'

export default function ObservationDetail() {
  const { id } = useParams<{ id: string }>()
  const [obs, setObs] = useState<Observation | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    location_id: '',
    taken_at: '',
    comment: '',
  })

  useEffect(() => {
    if (!id) return
    Promise.all([getObservation(id), getLocations()])
      .then(([o, l]) => {
        setObs(o)
        setLocations(l)
        setForm({
          location_id: o.location_id ?? '',
          taken_at: o.taken_at ? o.taken_at.slice(0, 16) : '',
          comment: o.comment ?? '',
        })
      })
      .catch(() => setError('Failed to load observation'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!obs) return
    setSaving(true)
    try {
      const body: Parameters<typeof updateObservation>[1] = {}
      if (form.location_id) body.location_id = form.location_id
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
  const locMap = Object.fromEntries(locations.map(l => [l.id, l]))

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
            {/* Left: photo + links */}
            <div className="card">
              <div className="card-body">
                <div className="photo-preview-box mb16">📷</div>
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
              </div>
            </div>

            {/* Right: editable form */}
            <div className="card">
              <div className="card-body">
                <div className="card-title" style={{ padding: 0, marginBottom: 16 }}>
                  Details
                </div>
                <div className="form-group">
                  <label className="form-label">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={form.taken_at}
                    onChange={e => setForm(f => ({ ...f, taken_at: e.target.value }))}
                    disabled={isConfirmed}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <select
                    value={form.location_id}
                    onChange={e =>
                      setForm(f => ({ ...f, location_id: e.target.value }))
                    }
                    disabled={isConfirmed}
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
                    disabled={isConfirmed}
                  />
                </div>

                {isConfirmed ? (
                  <div className="confirmed-banner">
                    ✓ Confirmed on{' '}
                    {new Date(obs.confirmed_at!).toLocaleString('en')}
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
