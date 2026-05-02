import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.js'
import { TypeBadge } from '../components/TypeBadge.js'
import type { Asset } from '../components/AssetCard.js'

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['asset', id],
    queryFn: async () => {
      if (!id) throw new Error('ID 없음')
      const res = await apiFetch(`/api/assets/${id}`)
      if (!res.ok) {
        const json = await res.json() as { error?: { message: string } }
        throw new Error(json.error?.message ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { ok: boolean; data: Asset }
      return json.data
    },
    enabled: !!id,
  })

  let typeFields: Record<string, unknown> = {}
  if (data?.typeFields) {
    try { typeFields = JSON.parse(data.typeFields) as Record<string, unknown> } catch { /* skip */ }
  }

  let tags: string[] = []
  if (data?.tags) {
    try { tags = JSON.parse(data.tags) as string[] } catch { /* skip */ }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <button
          onClick={() => navigate('/catalog')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 14, padding: 0 }}
        >
          ← 목록으로
        </button>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {isLoading && <p style={{ color: '#64748b', textAlign: 'center' }}>로딩 중…</p>}
        {error && (
          <div style={{ padding: '12px 16px', background: '#fee2e2', borderRadius: 8, color: '#991b1b' }}>
            {error instanceof Error ? error.message : '오류가 발생했습니다'}
          </div>
        )}
        {data && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' as const }}>
              <TypeBadge type={data.type} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>{data.name}</h1>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>v{data.version}</span>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: '#f1f5f9', color: '#475569' }}>{data.status}</span>
            </div>

            {data.description && (
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>{data.description}</p>
            )}

            {tags.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>태그</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {tags.map((tag, i) => (
                    <span key={i} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 4, fontSize: 12, color: '#475569' }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(typeFields).length > 0 && (
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>타입 필드</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
                  <tbody>
                    {Object.entries(typeFields).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 0', color: '#64748b', fontWeight: 500, width: 160 }}>{k}</td>
                        <td style={{ padding: '6px 0', color: '#1e293b' }}>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
