import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client.js'

type Notification = {
  id: string
  eventType: string
  assetId: string | null
  metadata: string
  readAt: number | null
  createdAt: number
}

const EVENT_LABEL: Record<string, string> = {
  review_approved: '자산 승인됨',
  review_rejected: '자산 반려됨',
  asset_published: '자산 게시됨',
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications')
      if (!res.ok) return { items: [] as Notification[], unread_count: 0 }
      const json = await res.json() as { ok: boolean; data: { items: Notification[]; unread_count: number } }
      return json.data
    },
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      if (!res.ok) throw new Error('mark read failed')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })

  const items = data?.items ?? []

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate('/catalog')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 14, padding: 0 }}
        >
          ← 카탈로그
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>알림</h1>
        {data && data.unread_count > 0 && (
          <span style={{
            background: '#ef4444', color: '#fff', borderRadius: 999,
            padding: '2px 8px', fontSize: 11, fontWeight: 700,
          }}>
            {data.unread_count} 미읽음
          </span>
        )}
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
        {isLoading && <p style={{ color: '#64748b', textAlign: 'center' }}>로딩 중…</p>}
        {!isLoading && items.length === 0 && (
          <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>알림이 없습니다</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {items.map(notif => {
            const isUnread = notif.readAt === null
            return (
              <div
                key={notif.id}
                style={{
                  background: isUnread ? '#eff6ff' : '#fff',
                  border: `1px solid ${isUnread ? '#bfdbfe' : '#e2e8f0'}`,
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: isUnread ? 600 : 400, color: '#1e293b' }}>
                    {EVENT_LABEL[notif.eventType] ?? notif.eventType}
                  </p>
                  {notif.assetId && (
                    <button
                      onClick={() => navigate(`/catalog/${notif.assetId}`)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, padding: 0 }}
                    >
                      자산 보기 →
                    </button>
                  )}
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                    {new Date(notif.createdAt * 1000).toLocaleString('ko-KR')}
                  </p>
                </div>
                {isUnread && (
                  <button
                    onClick={() => markReadMutation.mutate(notif.id)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe',
                      background: '#fff', color: '#2563eb', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    읽음
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
