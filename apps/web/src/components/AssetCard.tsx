import { TypeBadge } from './TypeBadge.js'

export type Asset = {
  id: string
  type: string
  name: string
  description: string | null
  tags: string
  authorId: string | null
  version: string
  status: string
  sourcePath: string | null
  typeFields: string
  createdAt: number
  updatedAt: number
}

export function AssetCard({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const desc = asset.description ?? ''
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        cursor: 'pointer',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '16px 20px',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <TypeBadge type={asset.type} />
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>{asset.name}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>v{asset.version}</span>
      </div>
      {desc && (
        <p style={{ color: '#64748b', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {desc.length > 120 ? desc.slice(0, 120) + '…' : desc}
        </p>
      )}
    </div>
  )
}
