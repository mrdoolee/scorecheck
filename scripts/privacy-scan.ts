// Before the repository goes public: look for real student data anywhere in its git history and in files that would
// be added. Terms come from sample_data/ (real NEIS files, local only) and are kept in memory; output is masked.
//
//   npx tsx scripts/privacy-scan.ts > report.txt
//
// Reports locations only. Deciding what to do (edit, drop files, rewrite history) is the maintainer's call.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readGrid } from '../src/core/import/xlsx'
import { importFiles } from '../src/core/import/assemble'
import { maskTerm, scanText, studentNoVariants, type Term } from './privacy-scan-core'

const root = path.resolve(__dirname, '..')
const sampleRoot = path.join(root, 'sample_data')
const SCHOOL_RE = /[가-힣]{1,12}(?:중학교|고등학교|초등학교)/g

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: root, maxBuffer: 1 << 30, encoding: 'utf8' })
}

async function pdfText(file: string): Promise<string> {
  const require_ = createRequire(__filename)
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require_.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 })
  const doc = await task.promise
  let out = ''
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent()
      out += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }
  } finally {
    await task.destroy()
  }
  return out
}

async function buildTerms(): Promise<Term[]> {
  const files = fs.readdirSync(sampleRoot, { recursive: true, encoding: 'utf8' }).filter((f) => !path.basename(f).startsWith('~$'))
  const names = new Set<string>(), teachers = new Set<string>(), numbers = new Set<string>(), schools = new Set<string>()
  for (const f of files) {
    const full = path.join(sampleRoot, f)
    if (f.endsWith('.xlsx')) {
      const grid = readGrid(fs.readFileSync(full))
      for (const row of grid) for (const c of row ?? []) for (const m of String(c ?? '').matchAll(SCHOOL_RE)) schools.add(m[0])
      const r = importFiles([{ fileName: f, grid }])
      for (const s of r.assessment?.students ?? []) {
        if (s.name.length >= 2) names.add(s.name)
        if (s.studentNo.length >= 6) numbers.add(s.studentNo)
      }
      for (const t of (r.assessment?.meta.teachers ?? '').split(/[,\s/·]+/)) if (/^[가-힣]{2,4}$/.test(t)) teachers.add(t)
    } else if (f.endsWith('.pdf')) {
      for (const m of (await pdfText(full)).matchAll(SCHOOL_RE)) schools.add(m[0])
    }
  }
  return [
    ...[...names].map((value) => ({ kind: 'name' as const, value })),
    ...[...teachers].filter((t) => !names.has(t)).map((value) => ({ kind: 'teacher' as const, value })),
    ...[...numbers].flatMap((n) => studentNoVariants(n).map((value) => ({ kind: 'studentNo' as const, value }))),
    ...[...schools].map((value) => ({ kind: 'school' as const, value }))
  ]
}

interface Found {
  where: string
  masked: string
  kind: string
}

function scanHistory(terms: Term[]): Found[] {
  const out: Found[] = []
  let commit = '', file = '(commit message)', lineNo = 0
  for (const line of git(['-c', 'core.quotePath=false', 'log', '--all', '-p', '--text', '--no-color', '--no-ext-diff']).split('\n')) {
    lineNo++
    if (line.startsWith('commit ')) {
      commit = line.slice(7, 14)
      file = '(commit message)'
      continue
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      const p = line.slice(4).replace(/^[ab]\//, '')
      if (p !== '/dev/null') file = p
      continue
    }
    for (const h of scanText(line, terms)) out.push({ where: `history ${commit} ${file}`, masked: maskTerm(h.term), kind: h.term.kind })
  }
  return out
}

function scanUntracked(terms: Term[]): Found[] {
  const out: Found[] = []
  const files = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
  for (const f of files) {
    const buf = fs.readFileSync(path.join(root, f))
    if (buf.includes(0)) continue // binary: listed separately
    for (const h of scanText(buf.toString('utf8'), terms)) out.push({ where: `untracked ${f}:${h.line}`, masked: maskTerm(h.term), kind: h.term.kind })
  }
  return out
}

function binariesInHistory(): string[] {
  const names = new Set(git(['log', '--all', '--name-only', '--pretty=format:']).split('\n').filter(Boolean))
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
  return [...names, ...untracked.map((u) => `${u} (untracked)`)].filter((n) =>
    /\.(xlsx?|pdf|png|jpe?g|gif|webp|pcapng?|etl|cap|hwp|hwpx|docx?|zip)( \(untracked\))?$/i.test(n) || /^(sample_data|scripts\/phase0\/out)\//.test(n)
  )
}

async function main() {
  if (!fs.existsSync(sampleRoot)) throw new Error('sample_data/ is missing: no terms to look for.')
  const terms = await buildTerms()
  const count = (k: string) => terms.filter((t) => t.kind === k).length
  console.log(`# Privacy scan ${new Date().toISOString()}`)
  console.log(`terms: ${count('name')} names, ${count('teacher')} teacher names, ${count('studentNo')} student numbers, ${count('school')} school names`)

  const found = [...scanHistory(terms), ...scanUntracked(terms)]
  const groups = new Map<string, Map<string, number>>()
  for (const f of found) {
    const key = `${f.where}`
    const g = groups.get(key) ?? new Map<string, number>()
    const label = `${f.kind} ${f.masked}`
    g.set(label, (g.get(label) ?? 0) + 1)
    groups.set(key, g)
  }
  console.log(`\n## Text hits: ${found.length} in ${groups.size} places`)
  for (const [where, g] of groups) console.log(`- ${where}: ${[...g].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(', ')}`)

  const bins = binariesInHistory()
  console.log(`\n## Binary or data files ever committed or about to be added: ${bins.length}`)
  for (const b of bins) console.log(`- ${b}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
