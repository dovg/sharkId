import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createDiveSession, deleteDiveSession, getDiveSessions, getLocations } from '../api'
import { Sidebar } from '../components/Sidebar'
import type { DiveSession, Location } from '../types'

export default function DiveSessions() {
  const [sessions, setSessions] = useState<DiveSession[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    location_id: '',
    started_at: '',
    ended_at: '',
    comment: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([getDiveSessions(), getLocations()])
      .then(([s, l]) => {
        setSessions(s.slice().sort((a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        ))
        setLocations(l)
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body: Parameters<typeof createDiveSession>[0] = {
        started_at: new Date(form.started_at).toISOString(),
      }
      if (form.ended_at) body.ended_at = new Date(form.ended_at).toISOString()
      if (form.location_id) body.location_id = form.location_id
      if (form.comment) body.comment = form.comment
      const s = await createDiveSession(body)
      setSessions(prev => [s, ...prev])
      setShowForm(false)
      setForm({ location_id: '', started_at: '', ended_at: '', comment: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!window.confirm('Delete this dive session? All observations will also be deleted.')) return
    try {
      await deleteDiveSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const locMap = Object.fromEntries(locations.map(l => [l.id, l]))

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dive Sessions</h1>
            <div className="page-subtitle">{sessions.length} sessions recorded</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            + New Session
          </button>
        </div>
        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          {showForm && (
            <div className="inline-form mb16">
              <div className="card-title" style={{ padding: 0, marginBottom: 16 }}>
                New Dive Session
              </div>
              <form onSubmit={handleCreate}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <select
                      value={form.location_id}
                      onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
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
                    <input
                      type="text"
                      value={form.comment}
                      onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input
                      type="datetime-local"
                      value={form.started_at}
                      onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input
                      type="datetime-local"
                      value={form.ended_at}
                      onChange={e => setForm(f => ({ ...f, ended_at: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex-gap8">
                  <button type="submit" className="btn btn-primary">Create Session</button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="muted">Loading…</div>
          ) : (
            <div className="session-list">
              {sessions.length === 0 && (
                <div className="empty-state">No dive sessions yet. Create one above.</div>
              )}
              {sessions.map(s => {
                const d = new Date(s.started_at)
                const loc = s.location_id ? locMap[s.location_id] : null
                return (
                  <div
                    key={s.id}
                    className="session-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/dive-sessions/${s.id}`)}
                  >
                    <div className="session-date-block">
                      <div className="day">{d.getDate()}</div>
                      <div className="month">
                        {d.toLocaleString('en', { month: 'short' })}
                      </div>
                    </div>
                    <div className="session-info">
                      <div className="session-title">
                        {loc ? `${loc.spot_name}, ${loc.country}` : 'Unknown Location'}
                      </div>
                      <div className="session-meta">
                        {d.toLocaleString('en')}
                        {s.comment && ` — ${s.comment}`}
                      </div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={e => handleDelete(e, s.id)}
                    >
                      Delete
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
