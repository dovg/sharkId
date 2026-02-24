const statusMap: Record<string, { label: string; cls: string }> = {
  uploaded:             { label: 'Uploaded',   cls: 's-uploaded' },
  processing:           { label: 'Processing', cls: 's-processing' },
  ready_for_validation: { label: 'Ready',      cls: 's-ready' },
  validated:            { label: 'Validated',  cls: 's-validated' },
  error:                { label: 'Error',      cls: 's-error' },
  temporary:            { label: 'Temporary',  cls: 's-temporary' },
  confirmed:            { label: 'Confirmed',  cls: 's-confirmed' },
  draft:                { label: 'Draft',      cls: 's-draft' },
}

export function StatusBadge({ status }: { status: string }) {
  const { label, cls } = statusMap[status] ?? { label: status, cls: '' }
  return <span className={`status ${cls}`}>{label}</span>
}
