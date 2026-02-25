import { useEffect } from 'react'

interface Props {
  url: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}

export function Lightbox({ url, onClose, onPrev, onNext }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onPrev, onNext])

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      {onPrev && (
        <button className="lightbox-nav lightbox-prev" onClick={e => { e.stopPropagation(); onPrev() }}>‹</button>
      )}
      <img src={url} alt="" onClick={e => e.stopPropagation()} />
      {onNext && (
        <button className="lightbox-nav lightbox-next" onClick={e => { e.stopPropagation(); onNext() }}>›</button>
      )}
    </div>
  )
}
