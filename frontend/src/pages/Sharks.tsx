import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteShark, getSharks } from '../api'
import { useAuth } from '../auth'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import type { NameStatus, Shark } from '../types'

export default function Sharks() {
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [sharks, setSharks] = useState<Shark[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | NameStatus>('all')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    getSharks()
      .then(setSharks)
      .catch(() => setError('Failed to load sharks'))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!window.confirm('Delete this shark? Associated photos and observations will be unlinked.')) return
    try {
      await deleteShark(id)
      setSharks(prev => prev.filter(s => s.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const filtered = sharks.filter(s => {
    const matchSearch = s.display_name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || s.name_status === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Shark Catalog</h1>
            <div className="page-subtitle">{sharks.length} sharks recorded</div>
          </div>
        </div>
        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          <div className="toolbar">
            <input
              type="text"
              placeholder="Search sharks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 260 }}
            />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as 'all' | NameStatus)}
              style={{ width: 'auto' }}
            >
              <option value="all">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>

          {loading ? (
            <div className="muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No sharks match your search.</div>
          ) : (
            <div className="shark-grid">
              {filtered.map(s => (
                <div
                  key={s.id}
                  className="shark-card"
                  onClick={() => navigate(`/sharks/${s.id}`)}
                >
                  <div className="shark-card-photo">
                    {s.main_photo_url
                      ? <img src={s.main_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                      : '🦈'}
                  </div>
                  <div className="shark-card-body">
                    <div className="shark-name">{s.display_name}</div>
                    <StatusBadge status={s.name_status} />
                    <div className="muted mt4" style={{ fontSize: 12 }}>
                      Added {new Date(s.created_at).toLocaleDateString('en')}
                    </div>
                    {canEdit && (
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ marginTop: 10, width: '100%' }}
                        onClick={e => handleDelete(e, s.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
