interface AlertErrorProps {
  message: string
}

export function AlertError({ message }: AlertErrorProps) {
  if (!message) return null
  return <div className="alert-error">{message}</div>
}
