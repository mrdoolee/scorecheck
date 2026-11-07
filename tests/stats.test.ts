import { describe, expect, it } from 'vitest'
import { round, summarize } from '../src/core/stats/stats'

describe('summarize', () => {
  it('uses population standard deviation', () => {
    const s = summarize([2, 4, 4, 4, 5, 5, 7, 9])
    expect(s.mean).toBe(5)
    expect(s.sd).toBe(2)
    expect(s.count).toBe(8)
  })
  it('handles empty input', () => {
    expect(summarize([]).mean).toBeNull()
  })
  it('rounds half away from zero', () => {
    expect(round(50.25, 1)).toBe(50.3)
    expect(round(28.375, 2)).toBe(28.38)
  })
})
