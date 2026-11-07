import { describe, expect, it } from 'vitest'
import { maskTerm, scanText, studentNoVariants, type Term } from '../scripts/privacy-scan-core'

const terms: Term[] = [
  { kind: 'name', value: '홍길동' },
  { kind: 'studentNo', value: '20260712' },
  { kind: 'school', value: '가나중학교' }
]

describe('privacy scan', () => {
  it('masks names, student numbers and schools', () => {
    expect(maskTerm({ kind: 'name', value: '홍길동' })).toBe('홍○동')
    expect(maskTerm({ kind: 'name', value: '남궁민수' })).toBe('남○○수')
    expect(maskTerm({ kind: 'name', value: '이산' })).toBe('이○')
    expect(maskTerm({ kind: 'studentNo', value: '20260712' })).toBe('2026****')
    expect(maskTerm({ kind: 'school', value: '가나중학교' })).toBe('가○중학교')
  })

  it('finds every term with its line number', () => {
    const hits = scanText('첫 줄\n홍길동 20260712\n가나중학교 3반', terms)
    expect(hits.map((h) => [h.line, h.term.kind])).toEqual([
      [2, 'name'],
      [2, 'studentNo'],
      [3, 'school']
    ])
  })

  it('also finds a student number in NEIS float notation', () => {
    expect(studentNoVariants('2026990123')).toEqual(['2026990123', '2.026990123E9'])
    const hits = scanText('학번 2.026990123E9', [{ kind: 'studentNo', value: '2.026990123E9' }])
    expect(hits).toHaveLength(1)
    expect(maskTerm(hits[0]!.term)).toBe('2.02*********')
  })

  it('does not report a student number inside a longer number', () => {
    expect(scanText('id 1202607123', terms)).toEqual([])
  })
})
