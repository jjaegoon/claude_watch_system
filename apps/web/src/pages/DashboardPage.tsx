import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../auth/AuthContext.js'
import { apiFetch } from '../api/client.js'

type DailyAssetStatRow  = { stat_date: string; view_count: number; install_count: number; trigger_count: number }
type DailyUserStatRow   = { stat_date: string; session_count: number; tool_call_count: number }
type TopAssetRow        = { asset_id: string; asset_name: string; asset_type: string; view_count: number; install_count: number; trigger_count: number }
type ReviewActivityRow  = { id: string; user_id: string; asset_id: string | null; ts: number; review_metadata: { action: string } }

// function 선언 사용 — TSX 파일에서 <T>가 JSX로 파싱되는 것을 방지
async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { ok: boolean; data: T }
  return json.data
}

export function DashboardPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const { data: assetStats = [], isLoading: assetLoading } =
    useQuery({ queryKey: ['stats', 'daily-assets'], queryFn: () => fetchJson<DailyAssetStatRow[]>('/api/stats/daily-assets?days=30') })

  const { data: userStats = [], isLoading: userLoading } =
    useQuery({ queryKey: ['stats', 'daily-users'], queryFn: () => fetchJson<DailyUserStatRow[]>('/api/stats/daily-users?days=30') })

  const { data: topAssets = [], isLoading: topLoading } =
    useQuery({ queryKey: ['stats', 'top-assets'], queryFn: () => fetchJson<TopAssetRow[]>('/api/stats/top-assets?days=30&limit=10') })

  const { data: reviewActivity = [] } =
    useQuery({ queryKey: ['stats', 'review-activity'], queryFn: () => fetchJson<ReviewActivityRow[]>('/api/stats/review-activity?days=30') })

  const totalViews    = assetStats.reduce((s, r) => s + r.view_count, 0)
  const totalInstalls = assetStats.reduce((s, r) => s + r.install_count, 0)
  const totalTriggers = assetStats.reduce((s, r) => s + r.trigger_count, 0)
  const totalReviews  = reviewActivity.length

  const isLoading = assetLoading || userLoading || topLoading

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>대시보드</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/catalog')}
            style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#475569' }}
          >
            카탈로그
          </button>
          <button
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#475569' }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        {isLoading && <p style={{ color: '#64748b', textAlign: 'center' }}>로딩 중…</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          <KpiCard label="총 조회수 (30d)"  value={totalViews}    color="#0d6efd" />
          <KpiCard label="총 설치수 (30d)"  value={totalInstalls} color="#0ca678" />
          <KpiCard label="총 트리거 (30d)"  value={totalTriggers} color="#f59e0b" />
          <KpiCard label="리뷰 활동 (30d)"  value={totalReviews}  color="#8b5cf6" />
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#334155' }}>일별 자산 활동 (30일)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={assetStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="stat_date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="view_count"    name="조회"   stroke="#0d6efd" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="install_count" name="설치"   stroke="#0ca678" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="trigger_count" name="트리거" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#334155' }}>일별 사용자 활동 (30일)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={userStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="stat_date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="session_count"   name="세션"    fill="#0d6efd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tool_call_count" name="툴 호출" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#334155' }}>상위 자산 Top 10 (조회수 기준)</h2>
          {topAssets.length === 0
            ? <p style={{ color: '#94a3b8', textAlign: 'center', margin: '24px 0' }}>데이터 없음</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    {['자산명', '타입', '조회', '설치', '트리거'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topAssets.map((row) => (
                    <tr key={row.asset_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#1e293b', fontWeight: 500 }}>{row.asset_name}</td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>{row.asset_type}</td>
                      <td style={{ padding: '8px 12px', color: '#0d6efd', fontWeight: 600 }}>{row.view_count}</td>
                      <td style={{ padding: '8px 12px', color: '#0ca678', fontWeight: 600 }}>{row.install_count}</td>
                      <td style={{ padding: '8px 12px', color: '#f59e0b', fontWeight: 600 }}>{row.trigger_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e2e8f0' }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color }}>{value.toLocaleString()}</p>
    </div>
  )
}
