import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.js'

type TagRow = { tag: string; count: number }

type Props = {
  selectedTag: string
  onTagSelect: (tag: string) => void
}

export function CategoryBrowser({ selectedTag, onTagSelect }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await apiFetch('/api/assets/tags')
      if (!res.ok) return []
      const json = await res.json() as { ok: boolean; data: TagRow[] }
      return json.data
    },
    staleTime: 60_000,
  })

  if (isLoading || !data?.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>태그 필터</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
        {selectedTag && (
          <button
            onClick={() => onTagSelect('')}
            style={{
              padding: '4px 10px', borderRadius: 999, border: '1px solid #d1d5db',
              fontSize: 12, background: '#fff', color: '#374151', cursor: 'pointer',
            }}
          >
            × 초기화
          </button>
        )}
        {data.map(({ tag, count }) => (
          <button
            key={tag}
            onClick={() => onTagSelect(selectedTag === tag ? '' : tag)}
            style={{
              padding: '4px 10px', borderRadius: 999, border: '1px solid',
              fontSize: 12, cursor: 'pointer',
              background: selectedTag === tag ? '#2563eb' : '#f8fafc',
              color: selectedTag === tag ? '#fff' : '#374151',
              borderColor: selectedTag === tag ? '#2563eb' : '#e2e8f0',
            }}
          >
            {tag} <span style={{ opacity: 0.7 }}>({count})</span>
          </button>
        ))}
      </div>
    </div>
  )
}
