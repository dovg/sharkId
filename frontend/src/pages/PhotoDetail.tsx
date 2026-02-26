import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addPhotoToModel, annotatePhoto, deletePhoto, getAuditLog, getPhoto, getPhotoModelStatus, recheckPhoto, removePhotoFromModel } from '../api'
import { useAuth } from '../auth'
import { EventHistory } from '../components/EventHistory'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import { usePageTitle } from '../hooks'
import type { AuditEvent, BBox, Orientation, Photo } from '../types'

// ── tiny helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)) }

function normaliseRect(ax: number, ay: number, bx: number, by: number): BBox {
  return {
    x: clamp(Math.min(ax, bx)),
    y: clamp(Math.min(ay, by)),
    w: clamp(Math.abs(bx - ax)),
    h: clamp(Math.abs(by - ay)),
  }
}

// ── SVG overlay used in step 1 and step 2 ────────────────────────────────────

interface DrawOverlayProps {
  saved: BBox | null
  live: BBox | null
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void
  onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void
}

function DrawOverlay({ saved, live, onMouseDown, onMouseMove, onMouseUp }: DrawOverlayProps) {
  const renderRect = (r: BBox, dashed = false) => (
    <rect
      x={r.x} y={r.y} width={r.w} height={r.h}
      fill="rgba(13,158,147,0.15)"
      stroke="#0d9e93"
      strokeWidth="0.003"
      strokeDasharray={dashed ? '0.012 0.008' : undefined}
    />
  )
  return (
    <svg
      className="annot-svg"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {saved && renderRect(saved)}
      {live && renderRect(live, true)}
    </svg>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function PhotoDetail() {
  usePageTitle('Photo')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const canEdit = role !== 'viewer'
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [inModel, setInModel] = useState<boolean | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  // annotation state
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [sharkRect, setSharkRect] = useState<BBox | null>(null)
  const [zoneRect, setZoneRect] = useState<BBox | null>(null)
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [liveRect, setLiveRect] = useState<BBox | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const cropCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return
    getPhoto(id)
      .then(p => {
        setPhoto(p)
        if (p.shark_bbox) setSharkRect(p.shark_bbox)
        if (p.zone_bbox) setZoneRect(p.zone_bbox)
        if (p.orientation) setOrientation(p.orientation)
        // Load model membership for validated+linked photos
        if (p.processing_status === 'validated' && p.shark_id) {
          getPhotoModelStatus(id).then(s => setInModel(s.in_model)).catch(() => {})
        }
      })
      .catch(() => setError('Failed to load photo'))
      .finally(() => setLoading(false))
    getAuditLog({ resource_type: 'photo', resource_id: id })
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false))
  }, [id])

  // draw shark crop onto canvas when entering step 2
  useEffect(() => {
    if (step !== 2 || !sharkRect || !photo?.url || !cropCanvasRef.current) return
    const canvas = cropCanvasRef.current
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      const sw = Math.max(1, Math.round(sharkRect.w * img.naturalWidth))
      const sh = Math.max(1, Math.round(sharkRect.h * img.naturalHeight))
      canvas.width = sw
      canvas.height = sh
      ctx.drawImage(
        img,
        Math.round(sharkRect.x * img.naturalWidth),
        Math.round(sharkRect.y * img.naturalHeight),
        sw, sh, 0, 0, sw, sh,
      )
    }
    img.src = photo.url
  }, [step, sharkRect, photo?.url])

  // ── drawing handlers ──────────────────────────────────────────────────────

  const svgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    }
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const { x, y } = svgCoords(e)
    setDragStart({ x, y })
    setLiveRect({ x, y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragStart) return
    const { x, y } = svgCoords(e)
    setLiveRect(normaliseRect(dragStart.x, dragStart.y, x, y))
  }

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragStart || !liveRect) { setDragStart(null); return }
    if (liveRect.w > 0.02 && liveRect.h > 0.02) {
      if (step === 1) setSharkRect(liveRect)
      if (step === 2) setZoneRect(liveRect)
    }
    setDragStart(null)
    setLiveRect(null)
  }

  // ── submit annotation ─────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!photo || !sharkRect || !zoneRect || !orientation) return
    setSubmitting(true)
    setError('')
    try {
      const updated = await annotatePhoto(photo.id, {
        shark_bbox: sharkRect,
        zone_bbox: zoneRect,
        orientation,
      })
      setPhoto(updated)
      setStep(1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Annotation failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── model toggle ──────────────────────────────────────────────────────────

  const handleAddToModel = async () => {
    if (!photo) return
    setModelBusy(true)
    setError('')
    try {
      await addPhotoToModel(photo.id)
      setInModel(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add to model')
    } finally {
      setModelBusy(false)
    }
  }

  const handleRemoveFromModel = async () => {
    if (!photo) return
    setModelBusy(true)
    setError('')
    try {
      await removePhotoFromModel(photo.id)
      setInModel(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove from model')
    } finally {
      setModelBusy(false)
    }
  }

  // ── recheck ───────────────────────────────────────────────────────────────

  const handleRecheck = async () => {
    if (!photo) return
    setRechecking(true)
    setError('')
    try {
      const updated = await recheckPhoto(photo.id)
      setPhoto(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recheck failed')
    } finally {
      setRechecking(false)
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!photo) return
    if (!window.confirm('Delete this photo? This cannot be undone.')) return
    setDeleting(true)
    setError('')
    try {
      await deletePhoto(photo.id)
      if (photo.dive_session_id) {
        navigate(`/dive-sessions/${photo.dive_session_id}`)
      } else {
        navigate('/dive-sessions')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  // ── loading / error guards ────────────────────────────────────────────────

  if (loading)
    return (
      <div className="app">
        <Sidebar />
        <div className="main"><div className="page-body"><div className="muted">Loading…</div></div></div>
      </div>
    )

  if (!photo)
    return (
      <div className="app">
        <Sidebar />
        <div className="main">
          <div className="page-body">
            <div className="alert-error">{error || 'Photo not found'}</div>
          </div>
        </div>
      </div>
    )

  const mlPrefilled = photo.auto_detected && !!(photo.shark_bbox && photo.zone_bbox)
  const canRecheck = canEdit && (
    (photo.processing_status === 'validated' && !photo.shark_id) ||
    photo.processing_status === 'error'
  )
  const showModelToggle = canEdit && photo.processing_status === 'validated' && !!photo.shark_id
  const stepLabel = (s: 1 | 2 | 3) => s < step ? 'done' : s === step ? 'active' : ''

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <div className="breadcrumb">
              {photo.dive_session_id && (
                <><Link to={`/dive-sessions/${photo.dive_session_id}`}>Session</Link>{' / '}</>
              )}
              Photo
            </div>
            <h1 className="page-title">Photo Detail</h1>
          </div>
          <div className="flex-gap8" style={{ alignItems: 'center' }}>
            <StatusBadge status={photo.processing_status} />
            {showModelToggle && inModel !== null && (
              <button
                className={`btn btn-sm ${inModel ? 'btn-outline' : 'btn-teal'}`}
                disabled={modelBusy}
                onClick={inModel ? handleRemoveFromModel : handleAddToModel}
                title={inModel ? 'Remove this photo from the ML model' : 'Add this photo to the ML model'}
              >
                {modelBusy ? '…' : inModel ? '✓ In Model' : '+ Add to Model'}
              </button>
            )}
            {canRecheck && (
              <button
                className="btn btn-outline btn-sm"
                disabled={rechecking}
                onClick={handleRecheck}
              >
                {rechecking ? 'Rechecking…' : 'Re-run ML'}
              </button>
            )}
            {canEdit && (
              <button
                className="btn btn-danger btn-sm"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting…' : 'Delete Photo'}
              </button>
            )}
          </div>
        </div>

        <div className="page-body">
          {error && <div className="alert-error mb16">{error}</div>}

          <div className="grid2" style={{ alignItems: 'start' }}>

            {/* ── Left: photo display (changes per step) ── */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {step === 1 && photo.url && (
                <div className="annot-photo-wrap">
                  <img src={photo.url} alt="" draggable={false} />
                  {canEdit ? (
                    <DrawOverlay
                      saved={sharkRect}
                      live={liveRect}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                    />
                  ) : sharkRect && (
                    <svg className="annot-svg" viewBox="0 0 1 1" preserveAspectRatio="none"
                      style={{ cursor: 'default', pointerEvents: 'none' }}>
                      <rect x={sharkRect.x} y={sharkRect.y} width={sharkRect.w} height={sharkRect.h}
                        fill="rgba(13,158,147,0.15)" stroke="#0d9e93" strokeWidth="0.003" />
                    </svg>
                  )}
                </div>
              )}

              {step === 1 && !photo.url && (
                <div className="photo-preview-box" style={{ fontSize: 60 }}>📷</div>
              )}

              {step === 2 && sharkRect && (
                <div
                  className="annot-crop-wrap"
                  style={{ aspectRatio: `${sharkRect.w} / ${sharkRect.h}` }}
                >
                  <canvas ref={cropCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                  {canEdit ? (
                    <DrawOverlay
                      saved={zoneRect}
                      live={liveRect}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                    />
                  ) : zoneRect && (
                    <svg className="annot-svg" viewBox="0 0 1 1" preserveAspectRatio="none"
                      style={{ cursor: 'default', pointerEvents: 'none' }}>
                      <rect x={zoneRect.x} y={zoneRect.y} width={zoneRect.w} height={zoneRect.h}
                        fill="rgba(13,158,147,0.15)" stroke="#0d9e93" strokeWidth="0.003" />
                    </svg>
                  )}
                </div>
              )}

              {step === 3 && photo.url && (
                <div className="annot-photo-wrap">
                  <img src={photo.url} alt="" draggable={false} />
                  <svg
                    className="annot-svg"
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    style={{ cursor: 'default', pointerEvents: 'none' }}
                  >
                    {sharkRect && (
                      <rect x={sharkRect.x} y={sharkRect.y} width={sharkRect.w} height={sharkRect.h}
                        fill="rgba(13,158,147,0.10)" stroke="#0d9e93" strokeWidth="0.003" />
                    )}
                    {sharkRect && zoneRect && (
                      <rect
                        x={sharkRect.x + zoneRect.x * sharkRect.w}
                        y={sharkRect.y + zoneRect.y * sharkRect.h}
                        width={zoneRect.w * sharkRect.w}
                        height={zoneRect.h * sharkRect.h}
                        fill="rgba(255,140,0,0.10)" stroke="#ff8c00" strokeWidth="0.003"
                      />
                    )}
                  </svg>
                </div>
              )}
            </div>

            {/* ── Right: annotation controls + metadata ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Annotation card */}
              <div className="card">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  Annotate
                  {mlPrefilled && (
                    <span className="auto-annot-badge" style={{ fontSize: 11 }}>🤖 ML pre-filled</span>
                  )}
                </div>
                <div style={{ padding: '0 20px 20px' }}>

                  {/* Step indicator */}
                  <div className="annot-steps">
                    <div className={`annot-step ${stepLabel(1)}`}>1. Shark</div>
                    <div className={`annot-step ${stepLabel(2)}`}>2. Zone</div>
                    <div className={`annot-step ${stepLabel(3)}`}>3. Orientation</div>
                  </div>

                  {/* Instructions */}
                  {step === 1 && (
                    <p className="annot-instructions">
                      {mlPrefilled
                        ? <>ML detected the <strong>shark region</strong>. Drag to adjust if needed, or click Next to accept.</>
                        : <>Draw a rectangle around the <strong>whole shark</strong>. Drag to draw, then redraw to adjust.</>}
                    </p>
                  )}
                  {step === 2 && (
                    <p className="annot-instructions">
                      {mlPrefilled
                        ? <>Shark crop shown. ML detected the <strong>identification zone</strong>. Drag to adjust or click Next to accept.</>
                        : <>The view is cropped to your shark selection. Draw a rectangle around the <strong>area between mouth and dorsal fin</strong>.</>}
                    </p>
                  )}
                  {step === 3 && (
                    <p className="annot-instructions">
                      Which direction is the shark <strong>facing</strong>?
                    </p>
                  )}

                  {/* Step 3: orientation picker */}
                  {step === 3 && (
                    <div className="orientation-grid">
                      <button
                        className={`orientation-btn${orientation === 'face_left' ? ' selected' : ''}`}
                        onClick={() => setOrientation('face_left')}
                      >
                        ← Face Left
                      </button>
                      <button
                        className={`orientation-btn${orientation === 'face_right' ? ' selected' : ''}`}
                        onClick={() => setOrientation('face_right')}
                      >
                        Face Right →
                      </button>
                    </div>
                  )}

                  {/* Navigation buttons */}
                  {canEdit && (
                    <div className="flex-gap8">
                      {step > 1 && (
                        <button className="btn btn-outline btn-sm" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}>
                          ← Back
                        </button>
                      )}
                      {step === 1 && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!sharkRect}
                          onClick={() => setStep(2)}
                        >
                          Next →
                        </button>
                      )}
                      {step === 2 && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!zoneRect}
                          onClick={() => setStep(3)}
                        >
                          Next →
                        </button>
                      )}
                      {step === 3 && (
                        <button
                          className="btn btn-teal btn-sm"
                          disabled={!orientation || submitting}
                          onClick={handleSubmit}
                        >
                          {submitting ? 'Saving…' : 'Confirm Annotation'}
                        </button>
                      )}
                      {step === 1 && sharkRect && (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSharkRect(null); setLiveRect(null) }}>
                          Reset
                        </button>
                      )}
                      {step === 2 && zoneRect && (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setZoneRect(null); setLiveRect(null) }}>
                          Reset
                        </button>
                      )}
                    </div>
                  )}

                  {/* Annotation summary (confirmed, not ML-pending) */}
                  {photo.shark_bbox && !photo.auto_detected && (
                    <div className="muted" style={{ marginTop: 16, fontSize: 12 }}>
                      {photo.orientation
                        ? `Annotated · ${photo.orientation === 'face_left' ? '← face left' : 'face right →'}`
                        : 'Annotated (no orientation)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata card */}
              <div className="card">
                <div className="card-title">Metadata</div>
                <div className="exif-table">
                  <div className="exif-row">
                    <span className="exif-key">File</span>
                    <span>{photo.object_key.split('/').pop()}</span>
                  </div>
                  <div className="exif-row">
                    <span className="exif-key">Date</span>
                    <span>{photo.taken_at ? new Date(photo.taken_at).toLocaleString('en') : '—'}</span>
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
                    <span className="exif-key">Shark</span>
                    <span>
                      {photo.shark_id
                        ? <Link to={`/sharks/${photo.shark_id}`} className="link">View shark</Link>
                        : '—'}
                    </span>
                  </div>
                  <div className="exif-row">
                    <span className="exif-key">Session</span>
                    <span>
                      {photo.dive_session_id
                        ? <Link to={`/dive-sessions/${photo.dive_session_id}`} className="link">View session</Link>
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Event History */}
              <EventHistory events={events} loading={eventsLoading} />

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
