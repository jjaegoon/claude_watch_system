const TYPE_STYLES: Record<string, { background: string; color: string }> = {
  skill:   { background: '#dbeafe', color: '#1d4ed8' },
  prompt:  { background: '#dcfce7', color: '#16a34a' },
  command: { background: '#ffedd5', color: '#ea580c' },
  mcp:     { background: '#f3e8ff', color: '#9333ea' },
}

export function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? { background: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
      ...style,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      display: 'inline-block',
    }}>
      {type}
    </span>
  )
}
