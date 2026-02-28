import { useCallback, useEffect, useState } from 'react'
import { getMlStats, rebuildEmbeddings } from '../api'
import { AlertError } from '../components/AlertError'
import { LoadingState } from '../components/LoadingState'
import { PageLayout } from '../components/PageLayout'
import { usePageTitle } from '../hooks'

type Stats = Awaited<ReturnType<typeof getMlStats>>

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function CoverageBar({ indexed, total, label }: { indexed: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((indexed / total) * 100)
  const color = pct === 100 ? 'var(--teal)' : pct >= 75 ? 'var(--blue)' : '#e6a817'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
        <span>{label}</span>
        <span className="muted">{indexed} / {total} ({pct}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

export default function MLModel() {
  usePageTitle('ML Model')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildMsg, setRebuildMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const load = useCallback(() => {
    setLoadErr('')
    getMlStats()
      .then(setStats)
      .catch(() => setLoadErr('Failed to load stats'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRebuild = async () => {
    setRebuilding(true)
    setRebuildMsg('')
    setIsError(false)
    try {
      await rebuildEmbeddings()
      setRebuildMsg('Rebuild started — running in background.')
      setTimeout(load, 2000)
    } catch (err: unknown) {
      setIsError(true)
      setRebuildMsg(err instanceof Error ? err.message : 'Rebuild failed')
    } finally {
      setRebuilding(false)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <PageLayout
      title="ML Model"
      subtitle="Recognition model statistics and management"
      actions={<button className="btn btn-outline btn-sm" onClick={load}>Refresh</button>}
    >
      <AlertError message={loadErr} />

      {stats && (
        <>
          {/* Status row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard
              label="ML Service"
              value={
                <span style={{ color: stats.ml_online ? 'var(--teal)' : '#c0392b', fontSize: 16, fontWeight: 600 }}>
                  {stats.ml_online ? '● Online' : '● Offline'}
                </span>
              }
            />
            <StatCard
              label="Embeddings in store"
              value={stats.embedding_count ?? '—'}
              sub={stats.embedding_dim ? `dim ${stats.embedding_dim}` : undefined}
            />
            <StatCard
              label="Sharks indexed"
              value={stats.indexed_sharks ?? '—'}
              sub={`of ${stats.total_sharks} in catalog`}
            />
            <StatCard
              label="Last rebuilt"
              value={<span style={{ fontSize: 15 }}>{formatDate(stats.last_rebuilt_at)}</span>}
              sub={stats.last_rebuilt_by ?? undefined}
            />
          </div>

          {/* Coverage bars */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Coverage</h2>
            <CoverageBar
              label="Photos indexed"
              indexed={stats.embedding_count ?? 0}
              total={stats.eligible_photos}
            />
            <CoverageBar
              label="Sharks indexed"
              indexed={stats.indexed_sharks ?? 0}
              total={stats.total_sharks}
            />
            {(stats.embedding_count ?? 0) < stats.eligible_photos && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {stats.eligible_photos - (stats.embedding_count ?? 0)} validated photo(s) not yet in the model.
                Rebuild to include them.
              </p>
            )}
          </div>

          {/* Rebuild action */}
          <div className="card">
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Rebuild Embeddings</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Resets the store and re-indexes all {stats.eligible_photos} validated linked photos.
              Run after bulk re-annotation or when recognition quality degrades.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={rebuilding} onClick={handleRebuild}>
                {rebuilding ? 'Rebuilding…' : 'Rebuild Embeddings'}
              </button>
              {rebuildMsg && (
                <span className={isError ? 'alert-error' : 'muted'} style={{ fontSize: 13 }}>
                  {rebuildMsg}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {!stats && !loadErr && (
        <LoadingState />
      )}
    </PageLayout>
  )
}
