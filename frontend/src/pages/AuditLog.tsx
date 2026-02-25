import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuditLog } from '../api'
import { Sidebar } from '../components/Sidebar'
import { usePageTitle } from '../hooks'
import type { AuditEvent } from '../types'

const RESOURCE_PATH: Record<string, string> = {
  photo:       '/photos',
  session:     '/dive-sessions',
  shark:       '/sharks',
  observation: '/observations',
}

const ACTION_LABEL: Record<string, string> = {
  'photo.upload':        'Photo uploaded',
  'photo.annotate':      'Annotation saved',
  'photo.validate':      'Photo validated',
  'photo.delete':        'Photo deleted',
  'session.create':      'Session created',
  'session.update':      'Session updated',
  'session.delete':      'Session deleted',
  'shark.create':        'Shark created',
  'shark.update':        'Shark updated',
  'shark.delete':        'Shark deleted',
  'observation.update':  'Observation updated',
  'observation.confirm': 'Observation confirmed',
  'location.create':     'Location created',
  'location.update':     'Location updated',
  'location.delete':     'Location deleted',
  'video.upload':        'Video uploaded',
  'video.delete':        'Video deleted',
  'auth.login':          'Logged in',
}

const PAGE_SIZE = 100

export default function AuditLog() {
  usePageTitle('Audit Log')
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    getAuditLog({ limit: PAGE_SIZE, offset: 0 })
      .then(data => {
        setEvents(data)
        setHasMore(data.length === PAGE_SIZE)
        setOffset(PAGE_SIZE)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadMore = () => {
    getAuditLog({ limit: PAGE_SIZE, offset })
      .then(data => {
        setEvents(prev => [...prev, ...data])
        setHasMore(data.length === PAGE_SIZE)
        setOffset(o => o + PAGE_SIZE)
      })
      .catch(() => {})
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <h1 className="page-title">Audit Log</h1>
        </div>
        <div className="page-body">
          {loading && <div className="muted">Loading…</div>}
          {!loading && events.length === 0 && (
            <div className="muted">No events recorded yet.</div>
          )}
          {!loading && events.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => {
                    const path = ev.resource_type ? RESOURCE_PATH[ev.resource_type] : null
                    return (
                      <tr key={ev.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(ev.created_at).toLocaleString('en')}
                        </td>
                        <td>{ev.user_email}</td>
                        <td>{ACTION_LABEL[ev.action] ?? ev.action}</td>
                        <td>
                          {path && ev.resource_id ? (
                            <Link to={`${path}/${ev.resource_id}`} className="link">
                              {ev.resource_type}/{ev.resource_id.slice(0, 8)}…
                            </Link>
                          ) : (
                            ev.resource_type ?? '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-outline btn-sm" onClick={loadMore}>
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
