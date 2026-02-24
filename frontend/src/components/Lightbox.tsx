interface Props {
  url: string
  onClose: () => void
}

export function Lightbox({ url, onClose }: Props) {
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      <img src={url} alt="" onClick={e => e.stopPropagation()} />
    </div>
  )
}
