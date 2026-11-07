import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { privacyMarkdown } from '../src/shared/privacy'

describe('개인정보 처리 안내', () => {
  it('PRIVACY.md matches the in-app text (regenerate with UPDATE_PRIVACY=1 npx vitest run tests/privacy.test.ts)', () => {
    const file = path.resolve(__dirname, '..', 'PRIVACY.md')
    if (process.env['UPDATE_PRIVACY']) fs.writeFileSync(file, privacyMarkdown())
    expect(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(privacyMarkdown())
  })
})
