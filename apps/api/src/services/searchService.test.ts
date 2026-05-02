import { describe, it, expect } from 'vitest'
import { buildFts5Query } from './searchService.js'

describe('buildFts5Query', () => {
  // case 1: 한국어 단일 토큰
  it('한국어 단일 단어 → prefix wildcard', () => {
    expect(buildFts5Query('코드리뷰')).toBe('코드리뷰*')
  })

  // case 2: 영어 단일 단어
  it('영어 단일 단어 → prefix wildcard', () => {
    expect(buildFts5Query('review')).toBe('review*')
  })

  // case 3: 하이픈 복합어 분리 (C-1 자율 발견 — `-`는 FTS5 negation 연산자)
  // FTS5 trigram에서 'code-review*' → "no such column: review" 에러 발생 확인.
  // T-27 verbatim 정합: FTS5_RESERVED에 `-` 포함 → 안전 분리.
  it('하이픈 복합어 → 분리 후 AND 결합', () => {
    expect(buildFts5Query('code-review')).toBe('code* AND review*')
  })

  // case 4: AND/OR/NOT 키워드 제거
  it('AND 키워드 제거 → 개별 wildcard AND 결합', () => {
    expect(buildFts5Query('A AND B')).toBe('A* AND B*')
  })

  // case 5: 빈 입력
  it('빈 문자열 → 빈 문자열', () => {
    expect(buildFts5Query('')).toBe('')
  })

  // case 6: 쌍따옴표·콜론 치환
  it('쌍따옴표·콜론 reserved 문자 치환', () => {
    expect(buildFts5Query('"hello":world')).toBe('hello* AND world*')
  })

  // case 7: 사용자 wildcard `*` 치환 후 자동 재추가
  it('사용자 입력 * 치환 후 wildcard 자동 추가', () => {
    expect(buildFts5Query('foo*')).toBe('foo*')
  })

  // case 8: 공백만 → 빈 문자열
  it('공백만 → 빈 문자열', () => {
    expect(buildFts5Query('   ')).toBe('')
  })

  // case 9: column-prefixed 보안 escape (`:` 치환)
  it('column-prefixed 입력 안전 escape', () => {
    expect(buildFts5Query('name:foo')).toBe('name* AND foo*')
  })

  // Opt B: 3자 미만 → 빈 문자열 (trigram 최소 토큰)
  it('2자 입력 → 빈 문자열 (Opt B)', () => {
    expect(buildFts5Query('코드')).toBe('')
  })

  it('1자 입력 → 빈 문자열 (Opt B)', () => {
    expect(buildFts5Query('a')).toBe('')
  })

  // Opt B: 3자는 통과
  it('3자 입력 → prefix wildcard (trigram 최소 충족)', () => {
    expect(buildFts5Query('코드리')).toBe('코드리*')
  })

  // gotcha #15: NFD 한글 → NFC 정규화 후 길이 판단
  // macOS HFS+가 NFD 반환 → NFD '코드' = 5 chars (base+vowel+final×2),
  // 하지만 NFC 정규화 후 2자 → Opt B → ''
  it('NFD 한글 정규화 후 3자 미만 → 빈 문자열', () => {
    const nfdKorean = '코드'.normalize('NFD') // macOS HFS+ 경로 등에서 등장
    expect(nfdKorean.length).toBeGreaterThan(2) // NFD는 합성 해제로 길이 증가
    expect(buildFts5Query(nfdKorean)).toBe('') // NFC 정규화 후 2자 → Opt B
  })

  // NOT 키워드 치환
  it('NOT 키워드 치환', () => {
    expect(buildFts5Query('foo NOT bar')).toBe('foo* AND bar*')
  })

  // 다중 공백 정규화
  it('다중 공백 → 단일 AND', () => {
    expect(buildFts5Query('hello   world')).toBe('hello* AND world*')
  })
})
