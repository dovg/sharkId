import type { AuditEvent } from '../types'

const ACTION_EMOJI: Record<string, string> = {
  'photo.upload':    '📤',
  'photo.annotate':  '✏️',
  'photo.validate':  '✅',
  'photo.delete':    '🗑️',
  'session.create':  '➕',
  'session.update':  '✏️',
  'session.delete':  '🗑️',
  'shark.create':    '➕',
  'shark.update':    '✏️',
  'shark.delete':    '🗑️',
  'observation.update':  '✏️',
  'observation.confirm': '✅',
  'location.create': '➕',
  'location.update': '✏️',
  'location.delete': '🗑️',
  'video.upload':    '📤',
  'video.delete':    '🗑️',
  'auth.login':      '🔑',
}

const ACTION_LABEL: Record<string, string> = {
  'photo.upload':    'Photo uploaded',
  'photo.annotate':  'Annotation saved',
  'photo.validate':  'Photo validated',
  'photo.delete':    'Photo deleted',
  'session.create':  'Session created',
  'session.update':  'Session updated',
  'session.delete':  'Session deleted',
  'shark.create':    'Shark created',
  'shark.update':    'Shark updated',
  'shark.delete':    'Shark deleted',
  'observation.update':  'Observation updated',
  'observation.confirm': 'Observation confirmed',
  'location.create': 'Location created',
  'location.update': 'Location updated',
  'location.delete': 'Location deleted',
  'video.upload':    'Video uploaded',
  'video.delete':    'Video deleted',
  'auth.login':      'Logged in',
}

interface Props {
  events: AuditEvent[]
  loading: boolean
}

export function EventHistory({ events, loading }: Props) {
  return (
    <div className="card">
      <div className="card-title">Event History</div>
      <div style={{ padding: '0 20px 20px' }}>
        {loading && <p className="muted">Loading…</p>}
        {!loading && events.length === 0 && (
          <p className="muted">No events recorded yet.</p>
        )}
        {!loading && events.length > 0 && (
          <ul className="timeline">
            {events.map(ev => (
              <li key={ev.id} className="tl-item">
                <div className="tl-dot">
                  {ACTION_EMOJI[ev.action] ?? '•'}
                </div>
                <div className="tl-content">
                  <span>{ACTION_LABEL[ev.action] ?? ev.action}</span>
                  <div className="tl-meta">
                    {new Date(ev.created_at).toLocaleString('en')}
                    <span className="muted" style={{ marginLeft: 6 }}>by {ev.user_email}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
