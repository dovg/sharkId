interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return <div className="muted">{message}</div>
}
