import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGrid } from '../src/core/import/xlsx'
import { importFiles } from '../src/core/import/assemble'

// Checks for the landing page in site/: fixed copy, no external loads, links that work without JS,
// a font subset that covers the page, and no real student name anywhere.
const site = path.resolve(__dirname, '..', 'site')
const sampleRoot = path.resolve(__dirname, '..', 'sample_data')
const hasSample = fs.existsSync(sampleRoot)

const read = (f: string) => fs.readFileSync(path.join(site, f), 'utf8')
const html = () => read('index.html')
/** Visible text of the page: tags, comments, scripts and styles removed, whitespace collapsed. */
const text = () =>
  html()
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const ALLOWED_EXTERNAL = [
  'https://www.instagram.com/trdoolee',
  'https://blog.naver.com/trdoolee',
  'https://copyright.keris.or.kr/wft/fntDwnldView?fntGrpId=GFT202301090000000000001'
]

function siteTextFiles(dir = site): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return siteTextFiles(p)
    return /\.(html|css|js|txt|json|svg)$/.test(e.name) ? [p] : []
  })
}

describe('landing page', () => {
  it('has the fixed copy', () => {
    const t = text()
    for (const s of [
      '성적 확인은',
      '서명은',
      '무료 · 관리자 권한 없이 설치 · 앱은 인터넷에 접속하지 않음',
      '서명 데이터는 노트북과 서명용 휴대폰 사이에서만 오갑니다.',
      '노트북이 학교 Wi-Fi나 유선에 연결된 상태에서 핫스팟을 켭니다.'
    ])
      expect(t).toContain(s)
  })

  it('makes no forbidden claims', () => {
    const t = text()
    for (const s of ['아이폰 지원', '관리자 권한 필요 없음', '모든 학교에서', '석차:', '등수:', '백분위:']) expect(t).not.toContain(s)
  })

  it('does not claim only the teacher can leave the student screen', () => {
    // The 🔒 button has no PIN; the app only locks full screen and blocks close/refresh shortcuts (PRIVACY.md §7).
    expect(text()).not.toContain('선생님만 돌아갈')
    expect(text()).toContain('창 닫기·새로 고침 단축키도 막힙니다')
  })

  it('says what reaches the phone as PRIVACY.md does', () => {
    // §5: class/number, masked name, and the row picture, which shows the row's name and scores.
    expect(text()).toContain('반·번호, 가운데를 가린 이름, 일람표 본인 줄 그림(머리글과 본인 행. 이 줄의 이름·점수가 보입니다)뿐입니다.')
    expect(text()).not.toContain('일람표 본인 줄 그림뿐입니다')
  })

  it('shows a visible focus ring on the navy band', () => {
    expect(read('styles.css')).toMatch(/\.band-ink :focus-visible\s*\{[^}]*outline-color:\s*var\(--marker\)/)
  })

  it('carries the full privacy notice as its own page, same text as PRIVACY.md', () => {
    const page = read('privacy.html')
    const pageText = page.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
    const md = fs.readFileSync(path.resolve(__dirname, '..', 'PRIVACY.md'), 'utf8')
    for (const line of md.split(/\r?\n/)) {
      const t = line.replace(/^#+\s*|^-\s+/, '').replace(/\s+/g, ' ').trim()
      if (t) expect(pageText).toContain(t)
    }
    const charset = new Set(read('fonts/charset.txt'))
    expect([...new Set(pageText)].filter((c) => c.charCodeAt(0) > 0x7e && !charset.has(c))).toEqual([])
    expect(page).toContain('href="styles.css"')
    expect(html()).toMatch(/<a[^>]*href="privacy\.html"[^>]*>개인정보 처리 안내 전문 보기<\/a>/)
    expect(html()).not.toContain('data-gh="privacy"')
  })

  it('has sections in order', () => {
    const ids = [...html().matchAll(/<(?:section|header)[^>]*\sid="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(['top', 'flow', 'features', 'privacy', 'analysis', 'install', 'faq'])
  })

  it('loads nothing from outside', () => {
    const h = html()
    const loads = [...h.matchAll(/<(?:script|img|source)[^>]*\ssrc="([^"]+)"/g), ...h.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]!)
    expect(loads.length).toBeGreaterThan(0)
    for (const u of loads) {
      expect(u).not.toMatch(/^(https?:)?\/\//)
      expect(fs.existsSync(path.join(site, u.split(/[?#]/)[0]!))).toBe(true)
    }
    const css = read('styles.css') + (fs.existsSync(path.join(site, 'mock.css')) ? read('mock.css') : '')
    expect(css).not.toMatch(/@import|url\(\s*['"]?(https?:)?\/\//)
    for (const m of h.matchAll(/<a[^>]*\shref="(https?:[^"]+)"/g)) expect(ALLOWED_EXTERNAL).toContain(m[1])
    for (const f of siteTextFiles().filter((f) => !f.endsWith('config.js')))
      expect(fs.readFileSync(f, 'utf8'), path.basename(f)).not.toContain('github.com')
  })

  it('download links work without JS', () => {
    const tags = [...html().matchAll(/<a[^>]*data-gh="[^"]+"[^>]*>/g)].map((m) => m[0])
    expect(tags.length).toBeGreaterThan(2)
    for (const t of tags) expect(t).toMatch(/href="#install"/)
  })

  it('subset font covers every character on the page', () => {
    const charset = new Set(read('fonts/charset.txt'))
    const missing = [...new Set(text())].filter((c) => c.charCodeAt(0) > 0x7e && !charset.has(c))
    expect(missing).toEqual([])
    for (const f of ['fonts/santteut-L.woff2', 'fonts/santteut-M.woff2', 'fonts/OFL.txt']) expect(fs.existsSync(path.join(site, f))).toBe(true)
  })

  it('fills every mock slot', () => {
    const h = html()
    for (const m of ['hero', 'step-import', 'step-sign', 'step-pdf', 'hotspot', 'analysis']) {
      const start = h.indexOf(`data-mock="${m}"`)
      expect(start, m).toBeGreaterThan(-1)
      const next = h.indexOf('data-mock="', start + 10)
      const body = h.slice(start, next === -1 ? undefined : next)
      expect(body.replace(/\s+/g, ' ').length, m).toBeGreaterThan(400)
    }
  })

  it('turns animation off for reduced motion', () => {
    expect(read('mock.css')).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*animation:\s*none/)
  })

  it('mock uses the fixed fake student', () => {
    expect(text()).toContain('윤하늘')
    expect(text()).toContain('가온중학교')
  })

  it.skipIf(!hasSample)('real-name guard: no real student name in site/', () => {
    const files = fs.readdirSync(sampleRoot, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.xlsx') && !path.basename(f).startsWith('~$'))
    const names = new Set<string>()
    for (const f of files) {
      const r = importFiles([{ fileName: f, grid: readGrid(fs.readFileSync(path.join(sampleRoot, f))) }])
      for (const s of r.assessment?.students ?? []) if (s.name.length >= 2) names.add(s.name)
    }
    expect(names.size).toBeGreaterThan(0)
    const all = siteTextFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    const hits = [...names].filter((n) => all.includes(n)).length
    expect(hits, 'real student names found in site/ (count only)').toBe(0)
  })
})
