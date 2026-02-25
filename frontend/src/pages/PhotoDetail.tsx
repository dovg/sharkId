import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { annotatePhoto, deletePhoto, getPhoto } from '../api'
import { Sidebar } from '../components/Sidebar'
import { StatusBadge } from '../components/StatusBadge'
import type { BBox, Orientation, Photo } from '../types'

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

// ── SVG overlay used in both step 1 and step 2 ───────────────────────────────

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
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // auto-annotation confirmation state
  const [confirmOrientation, setConfirmOrientation] = useState<Orientation | null>(null)
  const [confirming, setConfirming] = useState(false)

  // manual annotation state
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
        // pre-fill from existing annotation
        if (p.shark_bbox) setSharkRect(p.shark_bbox)
        if (p.zone_bbox) setZoneRect(p.zone_bbox)
        if (p.orientation) setOrientation(p.orientation)
      })
      .catch(() => setError('Failed to load photo'))
      .finally(() => setLoading(false))
  }, [id])

  // draw the shark crop onto the canvas whenever we enter step 2
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

  // ── drawing handlers (shared by step 1 and 2) ──────────────────────────────

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

  // ── confirm auto-detected annotation ────────────────────────────────────────

  const handleConfirmAuto = async () => {
    if (!photo?.shark_bbox || !photo?.zone_bbox || !confirmOrientation) return
    setConfirming(true)
    setError('')
    try {
      const updated = await annotatePhoto(photo.id, {
        shark_bbox: photo.shark_bbox,
        zone_bbox: photo.zone_bbox,
        orientation: confirmOrientation,
      })
      setPhoto(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
    } finally {
      setConfirming(false)
    }
  }

  // ── submit manual annotation ─────────────────────────────────────────────────

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

  // ── loading / error guards ─────────────────────────────────────────────────

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

  // ── step labels ────────────────────────────────────────────────────────────

  const stepLabel = (s: 1 | 2 | 3) =>
    s < step ? 'done' : s === step ? 'active' : ''

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
            <button
              className="btn btn-danger btn-sm"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Delete Photo'}
            </button>
          </div>
        </div>

        <div className="page-body">
          {error && <div className="alert-error mb16">{error}</div>}

          {/* ── Auto-annotation confirmation banner ── */}
          {photo.auto_detected && photo.shark_bbox && photo.zone_bbox && photo.url && (
            <div className="card auto-annot-card mb16">
              <div className="auto-annot-header">
                <span className="auto-annot-badge">🤖 Auto-detected</span>
                <span>ML detected the shark and identification zone. Review the highlighted regions, pick orientation, then confirm.</span>
              </div>

              {/* Photo preview with both rects overlaid */}
              <div className="annot-photo-wrap auto-annot-preview">
                <img src={photo.url} alt="" draggable={false} />
                <svg className="annot-svg" viewBox="0 0 1 1" preserveAspectRatio="none"
                  style={{ cursor: 'default', pointerEvents: 'none' }}>
                  {/* shark rect — teal */}
                  <rect
                    x={photo.shark_bbox.x} y={photo.shark_bbox.y}
                    width={photo.shark_bbox.w} height={photo.shark_bbox.h}
                    fill="rgba(13,158,147,0.15)" stroke="#0d9e93" strokeWidth="0.003"
                  />
                  {/* zone rect — converted from shark-relative to image-relative — orange */}
                  <rect
                    x={photo.shark_bbox.x + photo.zone_bbox.x * photo.shark_bbox.w}
                    y={photo.shark_bbox.y + photo.zone_bbox.y * photo.shark_bbox.h}
                    width={photo.zone_bbox.w * photo.shark_bbox.w}
                    height={photo.zone_bbox.h * photo.shark_bbox.h}
                    fill="rgba(255,140,0,0.15)" stroke="#ff8c00" strokeWidth="0.003"
                  />
                </svg>
              </div>

              {/* Legend */}
              <div className="auto-annot-legend">
                <span className="legend-dot teal" /> Shark body
                <span className="legend-dot orange" style={{ marginLeft: 16 }} /> Identification zone
              </div>

              {/* Orientation picker */}
              <div className="auto-annot-section">
                <div className="form-label mb8">Which way is the shark facing?</div>
                <div className="orientation-grid">
                  <button
                    className={`orientation-btn${confirmOrientation === 'face_left' ? ' selected' : ''}`}
                    onClick={() => setConfirmOrientation('face_left')}
                  >← Face Left</button>
                  <button
                    className={`orientation-btn${confirmOrientation === 'face_right' ? ' selected' : ''}`}
                    onClick={() => setConfirmOrientation('face_right')}
                  >Face Right →</button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex-gap8 auto-annot-actions">
                <button
                  className="btn btn-teal btn-sm"
                  disabled={!confirmOrientation || confirming}
                  onClick={handleConfirmAuto}
                >
                  {confirming ? 'Saving…' : '✓ Confirm Annotation'}
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setSharkRect(photo.shark_bbox)
                    setZoneRect(photo.zone_bbox)
                    setStep(1)
                  }}
                >
                  Edit Manually
                </button>
              </div>
            </div>
          )}

          <div className="grid2" style={{ alignItems: 'start' }}>

            {/* ── Left: photo display (changes per step) ── */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {step === 1 && photo.url && (
                <div className="annot-photo-wrap">
                  <img src={photo.url} alt="" draggable={false} />
                  <DrawOverlay
                    saved={sharkRect}
                    live={liveRect}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  />
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
                  <DrawOverlay
                    saved={zoneRect}
                    live={liveRect}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  />
                </div>
              )}

              {step === 3 && photo.url && (
                <div className="annot-photo-wrap">
                  <img src={photo.url} alt="" draggable={false} />
                  {/* show both rects read-only in step 3 */}
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
                  </svg>
                </div>
              )}
            </div>

            {/* ── Right: annotation controls + metadata ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Annotation card */}
              <div className="card">
                <div className="card-title">Annotate</div>
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
                      Draw a rectangle around the <strong>whole shark</strong> in the photo.
                      Drag to draw, then redraw to adjust.
                    </p>
                  )}
                  {step === 2 && (
                    <p className="annot-instructions">
                      The view is cropped to your shark selection.
                      Draw a rectangle around the <strong>area between mouth and dorsal fin</strong>.
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

                  {/* Existing annotation summary */}
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

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
