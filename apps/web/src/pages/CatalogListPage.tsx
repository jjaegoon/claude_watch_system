import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext.js'
import { apiFetch } from '../api/client.js'
import { AssetCard, type Asset } from '../components/AssetCard.js'

type ListResult = {
  items: Asset[]
  nextCursor: string | null
}

const TYPES = ['skill', 'prompt', 'command', 'mcp'] as const

export function CatalogListPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ['assets', debouncedSearch, selectedType],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (selectedType) params.set('type', selectedType)
      if (pageParam) params.set('cursor', pageParam as string)
      const res = await apiFetch(`/api/assets?${params.toString()}`)
      if (!res.ok) {
        const json = await res.json() as { error?: { message: string } }
        throw new Error(json.error?.message ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { ok: boolean; data: ListResult }
      return json.data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const allItems = data?.pages.flatMap(p => p.items) ?? []

  const handleLogout = () => {
    void logout().then(() => navigate('/login', { replace: true }))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Team Claude Catalog</h1>
        <button
          onClick={handleLogout}
          style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#475569' }}
        >
          로그아웃
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="자산 검색… (3자 이상)"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' as const }}>
          <FilterBtn label="전체" active={!selectedType} onClick={() => setSelectedType('')} />
          {TYPES.map(t => (
            <FilterBtn key={t} label={t} active={selectedType === t} onClick={() => setSelectedType(selectedType === t ? '' : t)} />
          ))}
        </div>

        {isLoading && <p style={{ color: '#64748b', textAlign: 'center' }}>로딩 중…</p>}
        {error && (
          <div style={{ padding: '12px 16px', background: '#fee2e2', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
            {error instanceof Error ? error.message : '오류가 발생했습니다'}
          </div>
        )}
        {!isLoading && allItems.length === 0 && !error && (
          <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>검색 결과가 없습니다</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {allItems.map(asset => (
            <AssetCard key={asset.id} asset={asset} onClick={() => navigate(`/catalog/${asset.id}`)} />
          ))}
        </div>

        {hasNextPage && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              style={{ padding: '8px 24px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#475569' }}
            >
              {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 6,
        border: '1px solid',
        fontSize: 13,
        background: active ? '#2563eb' : '#fff',
        color: active ? '#fff' : '#475569',
        borderColor: active ? '#2563eb' : '#d1d5db',
        cursor: 'pointer',
        textTransform: 'capitalize' as const,
      }}
    >
      {label}
    </button>
  )
}
