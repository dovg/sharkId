import { useEffect, useState } from 'react'
import {
  createLocation,
  deleteLocation,
  getLocations,
  updateLocation,
} from '../api'
import { useAuth } from '../auth'
import { Modal } from '../components/Modal'
import { Sidebar } from '../components/Sidebar'
import type { Location } from '../types'

export default function Locations() {
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ country: '', spot_name: '', lat: '', lon: '' })
  const [editLoc, setEditLoc] = useState<Location | null>(null)
  const [editForm, setEditForm] = useState({
    country: '',
    spot_name: '',
    lat: '',
    lon: '',
  })

  useEffect(() => {
    getLocations()
      .then(setLocations)
      .catch(() => setError('Failed to load locations'))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body: Parameters<typeof createLocation>[0] = {
        country: form.country,
        spot_name: form.spot_name,
      }
      if (form.lat) body.lat = parseFloat(form.lat)
      if (form.lon) body.lon = parseFloat(form.lon)
      const loc = await createLocation(body)
      setLocations(l => [...l, loc])
      setForm({ country: '', spot_name: '', lat: '', lon: '' })
      setShowForm(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    }
  }

  const openEdit = (l: Location) => {
    setEditLoc(l)
    setEditForm({
      country: l.country,
      spot_name: l.spot_name,
      lat: l.lat?.toString() ?? '',
      lon: l.lon?.toString() ?? '',
    })
  }

  const handleEdit = async () => {
    if (!editLoc) return
    try {
      const body: Parameters<typeof updateLocation>[1] = {
        country: editForm.country,
        spot_name: editForm.spot_name,
      }
      if (editForm.lat) body.lat = parseFloat(editForm.lat)
      if (editForm.lon) body.lon = parseFloat(editForm.lon)
      const updated = await updateLocation(editLoc.id, body)
      setLocations(ls => ls.map(l => (l.id === updated.id ? updated : l)))
      setEditLoc(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this location?')) return
    try {
      await deleteLocation(id)
      setLocations(ls => ls.filter(l => l.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const filtered = locations.filter(
    l =>
      l.country.toLowerCase().includes(search.toLowerCase()) ||
      l.spot_name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Locations</h1>
            <div className="page-subtitle">{locations.length} dive spots</div>
          </div>
          <div className="flex-gap8">
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            {canEdit && (
              <button
                className="btn btn-primary"
                onClick={() => setShowForm(v => !v)}
              >
                + Add Location
              </button>
            )}
          </div>
        </div>

        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          {canEdit && showForm && (
            <div className="inline-form mb16">
              <div className="card-title" style={{ padding: 0, marginBottom: 16 }}>
                Add Location
              </div>
              <form onSubmit={handleCreate}>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Spot Name</label>
                    <input
                      type="text"
                      value={form.spot_name}
                      onChange={e =>
                        setForm(f => ({ ...f, spot_name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lat / Lon</label>
                    <div className="flex-gap8">
                      <input
                        type="text"
                        placeholder="Lat"
                        value={form.lat}
                        onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Lon"
                        value={form.lon}
                        onChange={e => setForm(f => ({ ...f, lon: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex-gap8">
                  <button type="submit" className="btn btn-primary">Add</button>
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
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Spot</th>
                    <th>Coordinates</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="muted"
                        style={{ textAlign: 'center' }}
                      >
                        No locations found
                      </td>
                    </tr>
                  ) : (
                    filtered.map(l => (
                      <tr key={l.id}>
                        <td>{l.country}</td>
                        <td>{l.spot_name}</td>
                        <td>
                          {l.lat != null
                            ? `${l.lat.toFixed(4)}, ${l.lon?.toFixed(4)}`
                            : '—'}
                        </td>
                        <td>
                          {canEdit && (
                            <div className="flex-gap8">
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => openEdit(l)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(l.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editLoc && (
        <Modal
          title={`Edit — ${editLoc.spot_name}`}
          onClose={() => setEditLoc(null)}
        >
          <div className="form-group">
            <label className="form-label">Country</label>
            <input
              type="text"
              value={editForm.country}
              onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Spot Name</label>
            <input
              type="text"
              value={editForm.spot_name}
              onChange={e => setEditForm(f => ({ ...f, spot_name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Latitude</label>
            <input
              type="text"
              value={editForm.lat}
              onChange={e => setEditForm(f => ({ ...f, lat: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Longitude</label>
            <input
              type="text"
              value={editForm.lon}
              onChange={e => setEditForm(f => ({ ...f, lon: e.target.value }))}
            />
          </div>
          <div className="flex-gap8 mt16">
            <button className="btn btn-primary" onClick={handleEdit}>
              Save Changes
            </button>
            <button className="btn btn-outline" onClick={() => setEditLoc(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
