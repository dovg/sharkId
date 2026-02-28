import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSharks, getUnlinkedPhotos, getValidationQueue, recheckPhoto, suggestSharkName, validatePhoto } from '../api'
import { EmptyState } from '../components/EmptyState'
import { Lightbox } from '../components/Lightbox'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageLayout } from '../components/PageLayout'
import { StatusBadge } from '../components/StatusBadge'
import { usePageTitle } from '../hooks'
import type { Candidate, Photo, Shark } from '../types'

type SharkMap = Record<string, Shark>
type Tab = 'queue' | 'unlinked'

export default function ValidationQueue() {
  usePageTitle('Validation Queue')
  const [tab, setTab] = useState<Tab>('queue')

  // ── queue state ────────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<Photo[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)

  // New shark modal
  const [showNewShark, setShowNewShark] = useState(false)
  const [newSharkName, setNewSharkName] = useState('')
  const [setAsProfile, setSetAsProfile] = useState(true)

  // Shark picker modal
  const [showPicker, setShowPicker] = useState(false)
  const [sharks, setSharks] = useState<Shark[]>([])
  const [sharksMap, setSharksMap] = useState<SharkMap>({})
  const [sharkSearch, setSharkSearch] = useState('')
  const [pickedShark, setPickedShark] = useState<Shark | null>(null)

  // ── unlinked state ─────────────────────────────────────────────────────────
  const [unlinked, setUnlinked] = useState<Photo[]>([])
  const [recheckingId, setRecheckingId] = useState<string | null>(null)
  const [recheckingAll, setRecheckingAll] = useState(false)

  useEffect(() => {
    Promise.all([getValidationQueue(), getSharks(), getUnlinkedPhotos()])
      .then(([q, s, u]) => {
        setQueue(q)
        setIdx(0)
        setSharks(s)
        setSharksMap(Object.fromEntries(s.map(sh => [sh.id, sh])))
        setUnlinked(u)
      })
      .catch(() => setError('Failed to load queue'))
      .finally(() => setLoading(false))
  }, [])

  const photo = queue[idx] ?? null
  const total = queue.length

  const removeCurrentAndAdvance = () => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setIdx(i => Math.min(i, Math.max(next.length - 1, 0)))
      return next
    })
    setSelectedCandidate(null)
  }

  const submit = async (action: string, extra: object = {}) => {
    if (!photo) return
    setSubmitting(true)
    try {
      await validatePhoto(photo.id, { action, ...extra })
      removeCurrentAndAdvance()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const openNewShark = async () => {
    try {
      const { name } = await suggestSharkName()
      setNewSharkName(name)
    } catch {
      setNewSharkName('')
    }
    setSetAsProfile(true)
    setShowNewShark(true)
  }

  const openPicker = async () => {
    setSharkSearch('')
    setPickedShark(null)
    setShowPicker(true)
  }

  const handleConfirm = () => {
    if (!selectedCandidate) return
    submit('confirm', {
      shark_id: selectedCandidate.shark_id,
      set_as_profile_photo: false,
    })
  }

  const handleSelect = () => {
    if (!pickedShark) return
    submit('select', { shark_id: pickedShark.id })
    setShowPicker(false)
  }

  const handleCreate = () => {
    if (!newSharkName.trim()) return
    submit('create', {
      shark_name: newSharkName.trim(),
      name_status: 'temporary',
      set_as_profile_photo: setAsProfile,
    })
    setShowNewShark(false)
  }

  const filteredSharks = sharks.filter(s =>
    s.display_name.toLowerCase().includes(sharkSearch.toLowerCase()),
  )

  const handleRecheck = async (photoId: string) => {
    setRecheckingId(photoId)
    try {
      await recheckPhoto(photoId)
      setUnlinked(prev => prev.filter(p => p.id !== photoId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recheck failed')
    } finally {
      setRecheckingId(null)
    }
  }

  const handleRecheckAll = async () => {
    setRecheckingAll(true)
    setError('')
    const ids = unlinked.map(p => p.id)
    const results = await Promise.allSettled(ids.map(id => recheckPhoto(id)))
    const succeeded = ids.filter((_, i) => results[i].status === 'fulfilled')
    setUnlinked(prev => prev.filter(p => !succeeded.includes(p.id)))
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) setError(`${failed} photo${failed > 1 ? 's' : ''} could not be rechecked`)
    setRecheckingAll(false)
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (tab !== 'queue') return
    if (showNewShark || showPicker || lightboxUrl) return
    if (e.key === 'ArrowLeft')  setIdx(i => Math.max(i - 1, 0))
    if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, total - 1))
  }, [tab, showNewShark, showPicker, lightboxUrl, total])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (loading)
    return (
      <PageLayout title="Validation Queue">
        <LoadingState />
      </PageLayout>
    )

  return (
    <PageLayout
      title="Validation Queue"
      subtitle={
        tab === 'queue'
          ? `${total} photo${total !== 1 ? 's' : ''} awaiting identification`
          : `${unlinked.length} unlinked photo${unlinked.length !== 1 ? 's' : ''}`
      }
      actions={
        <>
          {/* Tab switcher */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              className={`btn btn-sm${tab === 'queue' ? ' btn-primary' : ' btn-ghost'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setTab('queue')}
            >
              Pending{total > 0 && <span className="badge" style={{ marginLeft: 6 }}>{total}</span>}
            </button>
            <button
              className={`btn btn-sm${tab === 'unlinked' ? ' btn-primary' : ' btn-ghost'}`}
              style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border)' }}
              onClick={() => setTab('unlinked')}
            >
              Unlinked{unlinked.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{unlinked.length}</span>}
            </button>
          </div>
          {/* Prev/Next only in queue tab */}
          {tab === 'queue' && total > 1 && (
            <>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setIdx(i => Math.max(i - 1, 0))}
                disabled={idx === 0}
              >
                ← Prev
              </button>
              <span className="muted">
                {idx + 1} / {total}
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setIdx(i => Math.min(i + 1, total - 1))}
                disabled={idx === total - 1}
              >
                Next →
              </button>
            </>
          )}
        </>
      }
    >
      {error && <div className="alert-error mb16">{error}</div>}

      {/* ── Unlinked tab ── */}
      {tab === 'unlinked' && (
        unlinked.length === 0 ? (
          <EmptyState message="No unlinked photos." />
        ) : (
          <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              className="btn btn-outline btn-sm"
              disabled={recheckingAll}
              onClick={handleRecheckAll}
            >
              {recheckingAll ? 'Rechecking all…' : `Re-run ML on all (${unlinked.length})`}
            </button>
          </div>
          <div className="photo-grid" style={{ padding: 0 }}>
            {unlinked.map(p => (
              <div key={p.id} className="photo-card">
                <Link to={`/photos/${p.id}`}>
                  <div className="photo-thumb">
                    {p.url
                      ? <img src={p.url} alt="" />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📷</div>}
                  </div>
                </Link>
                <div className="photo-thumb-meta">
                  <StatusBadge status={p.processing_status} />
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {p.taken_at ? new Date(p.taken_at).toLocaleDateString('en') : '—'}
                  </div>
                  {p.dive_session_id && (
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <Link to={`/dive-sessions/${p.dive_session_id}`} className="link">Session</Link>
                    </div>
                  )}
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: 6, width: '100%' }}
                    disabled={recheckingId === p.id}
                    onClick={() => handleRecheck(p.id)}
                  >
                    {recheckingId === p.id ? 'Rechecking…' : 'Re-run ML'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )
      )}

      {/* ── Queue tab ── */}
      {tab === 'queue' && (
        !photo ? (
          <EmptyState message="🎉 Validation queue is empty. All photos have been reviewed." />
        ) : (
        <div className="validation-layout">
          {/* Left: photo + metadata */}
          <div className="validation-photo-panel">
            <div className="card mb16">
              {photo.url ? (
                <div
                  className="annot-photo-wrap"
                  data-clickable=""
                  onClick={() => setLightboxUrl(photo.url!)}
                  style={{ cursor: 'zoom-in' }}
                >
                  <img src={photo.url} alt="Validation photo" draggable={false} />
                  {photo.shark_bbox && photo.zone_bbox && (
                    <svg
                      className="annot-svg"
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      style={{ cursor: 'zoom-in', pointerEvents: 'none' }}
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
                <div className="photo-preview-box">📷</div>
              )}
            </div>
            <div className="card">
              <div className="card-title">Image Metadata</div>
              <div className="exif-table">
                <div className="exif-row">
                  <span className="exif-key">File</span>
                  <span>{photo.object_key.split('/').pop()}</span>
                </div>
                <div className="exif-row">
                  <span className="exif-key">Date</span>
                  <span>
                    {photo.taken_at
                      ? new Date(photo.taken_at).toLocaleString('en')
                      : '—'}
                  </span>
                </div>
                <div className="exif-row">
                  <span className="exif-key">GPS</span>
                  <span>
                    {photo.gps_lat != null
                      ? `${photo.gps_lat.toFixed(5)}, ${photo.gps_lon?.toFixed(5)}`
                      : '—'}
                  </span>
                </div>
                <div className="exif-row">
                  <span className="exif-key">Size</span>
                  <span>{(photo.size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="exif-row">
                  <span className="exif-key">Type</span>
                  <span>{photo.content_type}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: candidates + actions */}
          <div>
            <div className="card mb16">
              <div className="card-title">Auto-ID Results</div>
              {!photo.top5_candidates || photo.top5_candidates.length === 0 ? (
                <div className="muted" style={{ padding: '0 20px 16px' }}>
                  No candidates found. Please identify manually.
                </div>
              ) : (
                <div className="candidates-list">
                  {photo.top5_candidates.map((c, i) => {
                    const sharkThumb = sharksMap[c.shark_id]?.main_photo_url
                    return (
                      <div
                        key={c.shark_id}
                        className={`candidate-item${selectedCandidate?.shark_id === c.shark_id ? ' selected' : ''}`}
                        onClick={() => setSelectedCandidate(c)}
                      >
                        <div className={`candidate-rank${i === 0 ? ' rank-1' : ''}`}>
                          {i + 1}
                        </div>
                        {sharkThumb ? (
                          <img
                            src={sharkThumb}
                            alt=""
                            style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, background: '#e5eaf0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🦈</div>
                        )}
                        <div className="candidate-info">
                          <div className="candidate-name">{c.display_name}</div>
                          <div className="score-bar">
                            <div
                              className="score-fill"
                              style={{ width: `${Math.round(c.score * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="score-pct">
                          {Math.round(c.score * 100)}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">Decision</div>
              <div className="action-buttons">
                <button
                  className="btn btn-success"
                  onClick={handleConfirm}
                  disabled={!selectedCandidate || submitting}
                >
                  Confirm Selected
                </button>
                <button
                  className="btn btn-outline"
                  onClick={openPicker}
                  disabled={submitting}
                >
                  Select Other Shark
                </button>
                <button
                  className="btn btn-teal"
                  onClick={openNewShark}
                  disabled={submitting}
                >
                  Create New Shark
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => submit('unlink')}
                  disabled={submitting}
                >
                  Leave Unlinked
                </button>
                <Link to={`/photos/${photo.id}`} className="btn btn-outline">
                  Edit Photo Annotation
                </Link>
              </div>
            </div>
          </div>
        </div>
        )
      )}

      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* New shark modal */}
      {showNewShark && (
        <Modal title="Create New Shark" onClose={() => setShowNewShark(false)}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              value={newSharkName}
              onChange={e => setNewSharkName(e.target.value)}
              autoFocus
            />
            <div className="form-help">Temporary name — can be changed later</div>
          </div>
          <div className="form-group">
            <label className="form-label">Name Status</label>
            <input type="text" value="temporary" disabled />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={setAsProfile}
                onChange={e => setSetAsProfile(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Set this photo as profile photo
            </label>
          </div>
          <div className="flex-gap8 mt16">
            <button
              className="btn btn-teal"
              onClick={handleCreate}
              disabled={!newSharkName.trim() || submitting}
            >
              Create & Confirm
            </button>
            <button className="btn btn-outline" onClick={() => setShowNewShark(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Shark picker modal */}
      {showPicker && (
        <Modal title="Select Shark" onClose={() => setShowPicker(false)}>
          <input
            type="text"
            className="form-control mb16"
            placeholder="Search sharks…"
            value={sharkSearch}
            onChange={e => setSharkSearch(e.target.value)}
            autoFocus
          />
          <div className="shark-picker-list">
            {filteredSharks.length === 0 ? (
              <div className="muted" style={{ padding: 12 }}>No sharks found</div>
            ) : (
              filteredSharks.map(s => (
                <div
                  key={s.id}
                  className={`shark-picker-item${pickedShark?.id === s.id ? ' selected' : ''}`}
                  onClick={() => setPickedShark(s)}
                >
                  <span>{s.display_name}</span>
                  <span className={`status s-${s.name_status}`}>{s.name_status}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex-gap8 mt16">
            <button
              className="btn btn-primary"
              onClick={handleSelect}
              disabled={!pickedShark || submitting}
            >
              Confirm Selection
            </button>
            <button className="btn btn-outline" onClick={() => setShowPicker(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </PageLayout>
  )
}
