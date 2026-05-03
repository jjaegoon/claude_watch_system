import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../api/client.js'

type Props = {
  assetId?: string  // undefined = 시스템 피드백 (S10)
  onClose: () => void
}

type FeedbackType = 'bug_report' | 'improvement' | 'system_feedback'

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  bug_report:      '버그 보고',
  improvement:     '개선 제안',
  system_feedback: '시스템 피드백',
}

export function FeedbackModal({ assetId, onClose }: Props) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(
    assetId ? 'bug_report' : 'system_feedback',
  )
  const [content, setContent] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { feedback_type: feedbackType, content }
      if (assetId) body.asset_id = assetId
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: { message: string } }
        throw new Error(json.error?.message ?? `HTTP ${res.status}`)
      }
    },
    onSuccess: () => { setTimeout(onClose, 800) },
  })

  const typeOptions: FeedbackType[] = assetId
    ? ['bug_report', 'improvement']
    : ['system_feedback', 'improvement']

  const canSubmit = content.trim().length >= 10 && !mutation.isPending && !mutation.isSuccess

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
          {assetId ? '피드백 제출' : '시스템 개선 제안'}
        </h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>유형</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {typeOptions.map(type => (
              <button
                key={type}
                onClick={() => setFeedbackType(type)}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: '1px solid', fontSize: 12, cursor: 'pointer',
                  background: feedbackType === type ? '#2563eb' : '#f8fafc',
                  color: feedbackType === type ? '#fff' : '#374151',
                  borderColor: feedbackType === type ? '#2563eb' : '#e2e8f0',
                }}
              >
                {FEEDBACK_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            내용 <span style={{ color: '#94a3b8' }}>(최소 10자)</span>
          </label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="문제 상황이나 개선 아이디어를 자세히 적어주세요…"
            rows={4}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8,
              fontSize: 13, resize: 'vertical' as const, boxSizing: 'border-box' as const,
              fontFamily: 'inherit', color: '#1e293b',
            }}
          />
        </div>

        {mutation.isError && (
          <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>
            {mutation.error instanceof Error ? mutation.error.message : '제출 실패'}
          </p>
        )}
        {mutation.isSuccess && (
          <p style={{ color: '#16a34a', fontSize: 12, marginBottom: 12 }}>피드백이 제출됐습니다!</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none', fontSize: 13,
              background: canSubmit ? '#2563eb' : '#94a3b8',
              color: '#fff', cursor: canSubmit ? 'pointer' : 'default', fontWeight: 500,
            }}
          >
            {mutation.isPending ? '제출 중…' : '제출'}
          </button>
        </div>
      </div>
    </div>
  )
}
