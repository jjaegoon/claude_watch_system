import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext.js'
import { apiFetch } from '../api/client.js'
import { AssetCard, type Asset } from '../components/AssetCard.js'
import { CategoryBrowser } from '../components/CategoryBrowser.js'
import { FeedbackModal } from '../components/FeedbackModal.js'

type ListResult = {
  items: Asset[]
  nextCursor: string | null
}

type SortOption = 'updated_at' | 'name' | 'view_count' | 'download_count'

const TYPES = ['skill', 'prompt', 'command', 'mcp'] as const

const SORT_LABELS: Record<SortOption, string> = {
  updated_at:    '최신순',
  name:          '이름순',
  view_count:    '조회순',
  download_count: '다운로드순',
}

export function CatalogListPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [sort, setSort] = useState<SortOption>('updated_at')
  const [selectedTag, setSelectedTag] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // D-12: 알림 미읽음 수 폴링 (30s interval)
  const { data: notifData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications?unread=1')
      if (!res.ok) return { unread_count: 0 }
      const json = await res.json() as { ok: boolean; data: { unread_count: number } }
      return json.data
    },
    refetchInterval: 30_000,
  })
  const unreadCount = notifData?.unread_count ?? 0

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ['assets', debouncedSearch, selectedType, sort, selectedTag],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (selectedType) params.set('type', selectedType)
      if (sort !== 'updated_at') params.set('sort', sort)
      if (selectedTag) params.set('tag', selectedTag)
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' as const }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Team Claude Catalog</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/notifications')}
            style={{
              padding: '6px 14px', background: unreadCount > 0 ? '#ef4444' : '#f1f5f9',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
              color: unreadCount > 0 ? '#fff' : '#475569',
            }}
          >
            {unreadCount > 0 ? `알림 ${unreadCount}` : '알림'}
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ padding: '6px 14px', background: '#8b5cf6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#fff' }}
          >
            대시보드
          </button>
          <button
            onClick={() => navigate('/catalog/new')}
            style={{ padding: '6px 14px', background: '#0d6efd', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#fff' }}
          >
            + 새 자산
          </button>
          <button
            onClick={handleLogout}
            style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#475569' }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 900, margin: '0 auto', padding: '24px 16px', width: '100%' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="자산 검색… (3자 이상)"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' as const }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <FilterBtn label="전체" active={!selectedType} onClick={() => setSelectedType('')} />
          {TYPES.map(t => (
            <FilterBtn key={t} label={t} active={selectedType === t} onClick={() => setSelectedType(selectedType === t ? '' : t)} />
          ))}

          <div style={{ marginLeft: 'auto' }}>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              style={{
                padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6,
                fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer',
              }}
            >
              {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <CategoryBrowser selectedTag={selectedTag} onTagSelect={setSelectedTag} />

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

      {/* S10: 시스템 피드백 footer */}
      <footer style={{ borderTop: '1px solid #e2e8f0', padding: '12px 24px', textAlign: 'center', background: '#fff' }}>
        <button
          onClick={() => setFeedbackOpen(true)}
          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
        >
          시스템 개선 제안
        </button>
      </footer>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  )
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 6, border: '1px solid', fontSize: 13,
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
