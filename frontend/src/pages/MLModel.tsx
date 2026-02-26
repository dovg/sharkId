import { useState } from 'react'
import { rebuildEmbeddings } from '../api'
import { Sidebar } from '../components/Sidebar'
import { usePageTitle } from '../hooks'

export default function MLModel() {
  usePageTitle('ML Model')
  const [rebuilding, setRebuilding] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const handleRebuild = async () => {
    setRebuilding(true)
    setMsg('')
    setIsError(false)
    try {
      await rebuildEmbeddings()
      setMsg('Rebuild started — running in background. New embeddings will be available in a minute.')
    } catch (err: unknown) {
      setIsError(true)
      setMsg(err instanceof Error ? err.message : 'Rebuild failed')
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">ML Model</h1>
            <div className="page-subtitle">Recognition model management</div>
          </div>
        </div>

        <div className="page-body">
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Rebuild Embeddings</h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
              Resets the recognition model and rebuilds it from all validated linked photos.
              Run this after bulk re-annotation, after adding new sharks, or when recognition
              quality degrades.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                disabled={rebuilding}
                onClick={handleRebuild}
              >
                {rebuilding ? 'Rebuilding…' : 'Rebuild Embeddings'}
              </button>
              {msg && (
                <span className={isError ? 'alert-error' : 'muted'} style={{ fontSize: 13 }}>
                  {msg}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
