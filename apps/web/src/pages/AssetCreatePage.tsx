// T-22: discriminated union TYPE_FIELD_COMPONENTS — 4 type별 폼 필드
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client.js'

type AssetType = 'skill' | 'prompt' | 'command' | 'mcp'

interface TypeFieldsProps {
  typeFields: Record<string, unknown>
  onChange: (fields: Record<string, unknown>) => void
}

function field(
  label: string,
  value: string,
  onInput: (v: string) => void,
  opts?: { placeholder?: string; rows?: number; required?: boolean },
) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
        {label}{opts?.required ? ' *' : ''}
      </label>
      {opts?.rows ? (
        <textarea
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder={opts.placeholder}
          rows={opts.rows}
          style={{ width: '100%', boxSizing: 'border-box', padding: 6 }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder={opts?.placeholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: 6 }}
        />
      )}
    </div>
  )
}

function SkillFields({ typeFields: f, onChange }: TypeFieldsProps) {
  const s = (k: string) => (f[k] as string) ?? ''
  const u = (k: string) => (v: string) => onChange({ ...f, [k]: v })
  return (
    <>
      {field('when_to_use', s('when_to_use'), u('when_to_use'), {
        placeholder: 'skill이 자동 발화되는 상황 (30자 이상, 동작 단계 3개+)',
        rows: 3, required: true,
      })}
      {field('model', s('model'), u('model'), { placeholder: 'claude-sonnet-4-6' })}
      {field('skill_md_path', s('skill_md_path'), u('skill_md_path'), { placeholder: 'skills/my-skill.md' })}
    </>
  )
}

function PromptFields({ typeFields: f, onChange }: TypeFieldsProps) {
  const s = (k: string) => (f[k] as string) ?? ''
  const u = (k: string) => (v: string) => onChange({ ...f, [k]: v })
  return (
    <>
      {field('prompt_text', s('prompt_text'), u('prompt_text'), {
        placeholder: '역할(Role:) / 제약(Constraints:) / 출력 형식(Output:) 3블록 명시',
        rows: 6, required: true,
      })}
      {field('variables', s('variables'), u('variables'), {
        placeholder: '{{변수명1}}, {{변수명2}} (쉼표 구분)',
      })}
    </>
  )
}

function CommandFields({ typeFields: f, onChange }: TypeFieldsProps) {
  const s = (k: string) => (f[k] as string) ?? ''
  const u = (k: string) => (v: string) => onChange({ ...f, [k]: v })
  return (
    <>
      {field('slash_name', s('slash_name'), u('slash_name'), {
        placeholder: 'my-command (소문자·숫자·하이픈, 2-31자, /prefix 없이)',
        required: true,
      })}
      {field('command_text', s('command_text'), u('command_text'), {
        placeholder: '슬래시 명령 실행 내용', rows: 4,
      })}
    </>
  )
}

function McpFields({ typeFields: f, onChange }: TypeFieldsProps) {
  const s = (k: string) => (f[k] as string) ?? ''
  const u = (k: string) => (v: string) => onChange({ ...f, [k]: v })
  return (
    <>
      {field('repo_url', s('repo_url'), u('repo_url'), {
        placeholder: 'https://github.com/org/mcp-tool', required: true,
      })}
      {field('install_cmd', s('install_cmd'), u('install_cmd'), {
        placeholder: 'npx install-mcp',
      })}
      {field('required_env', s('required_env'), u('required_env'), {
        placeholder: 'API_KEY, BASE_URL (키 이름만, 값 저장 금지)',
      })}
    </>
  )
}

// T-22 TYPE_FIELD_COMPONENTS: discriminated union
const TYPE_FIELD_COMPONENTS: Record<AssetType, React.ComponentType<TypeFieldsProps>> = {
  skill:   SkillFields,
  prompt:  PromptFields,
  command: CommandFields,
  mcp:     McpFields,
}

export function AssetCreatePage() {
  const navigate = useNavigate()
  const [assetType, setAssetType] = useState<AssetType>('skill')
  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [tagsRaw, setTagsRaw]       = useState('')
  const [version, setVersion]       = useState('1.0.0')
  const [typeFields, setTypeFields] = useState<Record<string, unknown>>({})
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)

  const handleTypeChange = (t: AssetType) => {
    setAssetType(t)
    setTypeFields({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)

    try {
      const res = await apiFetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: assetType,
          name,
          description: description || undefined,
          tags,
          version,
          typeFields,
        }),
      })

      const json = await res.json() as {
        ok: boolean
        data?: { id: string }
        error?: { code: string; message: string }
      }

      if (!json.ok || !json.data) {
        setError(json.error?.message ?? '등록 실패')
        return
      }

      navigate(`/catalog/${json.data.id}`)
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const TypeFieldComponent = TYPE_FIELD_COMPONENTS[assetType]

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/catalog')} style={{ padding: '4px 12px' }}>← 목록</button>
        <h1 style={{ margin: 0 }}>자산 등록</h1>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e) }}>
        {/* Type selection */}
        <fieldset style={{ marginBottom: 20, padding: 12 }}>
          <legend style={{ fontWeight: 600 }}>타입 *</legend>
          {(['skill', 'prompt', 'command', 'mcp'] as AssetType[]).map((t) => (
            <label key={t} style={{ marginRight: 20, cursor: 'pointer' }}>
              <input
                type="radio"
                name="assetType"
                value={t}
                checked={assetType === t}
                onChange={() => handleTypeChange(t)}
                style={{ marginRight: 4 }}
              />
              {t}
            </label>
          ))}
        </fieldset>

        {/* Common fields */}
        {field('이름', name, setName, { placeholder: 'code-review-skill (영소문자·숫자·하이픈)', required: true })}
        {field('설명', description, setDescription, { placeholder: '자산이 해결하는 단일 문제를 1문장으로', rows: 2 })}
        {field('태그 (쉼표 구분)', tagsRaw, setTagsRaw, { placeholder: 'review, typescript, code' })}
        {field('버전', version, setVersion, { placeholder: '1.0.0 (semver)' })}

        {/* Type-specific fields */}
        <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 4, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {assetType} 필드
          </div>
          <TypeFieldComponent typeFields={typeFields} onChange={setTypeFields} />
        </div>

        {error && (
          <div style={{ color: '#dc3545', background: '#fff5f5', border: '1px solid #f5c6cb', borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '8px 28px', background: loading ? '#6c757d' : '#0d6efd', color: 'white', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '등록 중…' : '등록'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/catalog')}
            style={{ padding: '8px 16px', border: '1px solid #dee2e6', borderRadius: 4, background: 'white', cursor: 'pointer' }}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
