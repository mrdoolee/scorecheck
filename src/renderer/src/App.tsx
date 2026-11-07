import { useEffect, useRef, useState } from 'react'
import type { SignaturePayload } from '../../core/signature/signature'
import type { ImportView } from '../../shared/ipc'
import type { PhoneInfo } from './components/PhonePanel'
import { CheckScreen, type Progress } from './screens/CheckScreen'
import { ImportScreen, type WorkDraft } from './screens/ImportScreen'
import { PdfScreen } from './screens/PdfScreen'
import { AnalysisScreen } from './screens/AnalysisScreen'
import type { ItemInfo } from '../../core/item-analysis/info'
import { WorkList } from './components/WorkList'
import { AppFooter } from './components/AppFooter'
import { ErrorBoundary } from './components/ErrorBoundary'
import logo from './assets/logo.png'

type Tab = 'import' | 'check' | 'pdf' | 'analysis'

const TABS: { id: Tab; label: string; step?: string }[] = [
  { id: 'import', label: '성적 입력', step: '①' },
  { id: 'check', label: '성적 확인·서명', step: '②' },
  { id: 'pdf', label: 'PDF 저장', step: '③' },
  { id: 'analysis', label: '문항 분석' }
]

export interface Work extends WorkDraft {
  workId: string
  view: ImportView
  /** 문항정보 typed in by the teacher (optional). */
  itemInfo: ItemInfo | null
  /** Classes with an imported 일람표 PDF. Signing is blocked for the others (nowhere to put the signature). */
  pdfClasses: number[]
}

const pdfClassesOf = (pdfs: Record<number, unknown> | undefined) => Object.keys(pdfs ?? {}).map(Number)

const EMPTY: Progress = { checked: {}, signed: {} }

export function App() {
  const [tab, setTab] = useState<Tab>('import')
  const [work, setWork] = useState<Work | null>(null)
  const [progress, setProgressState] = useState<Progress>(EMPTY)
  const [devOpen, setDevOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Kept here, not in PhonePanel: the panel unmounts while a student screen is open, and the QR must survive that.
  const [phoneInfo, setPhoneInfo] = useState<PhoneInfo | null>(null)
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [lastSaved, setLastSaved] = useState<{ key: string; at: number } | null>(null)
  const workRef = useRef<Work | null>(null)
  workRef.current = work
  const [listKey, setListKey] = useState(0)

  async function openWork(id: string) {
    const r = await window.api.openWork(id)
    if (!r.ok) {
      setError(r.error)
      setListKey((k) => k + 1)
      return
    }
    setWork({
      workId: r.work.workId,
      workName: r.work.workName,
      meta: r.view.meta,
      wholeGradeConfirmed: r.work.wholeGradeConfirmed,
      sourcePaths: [],
      view: r.view,
      itemInfo: r.itemInfo ?? null,
      pdfClasses: pdfClassesOf(r.work.pdfs)
    })
    setProgressState(r.progress)
    setTab('check')
  }

  /** Called by the work list after a delete, so an open work never shows stale data. */
  function onWorkChanged(id: string, change: 'deleted' | 'signatures-deleted') {
    if (workRef.current?.workId !== id) return
    if (change === 'deleted') {
      setWork(null)
      setProgressState(EMPTY)
    } else {
      setProgressState((p) => ({ ...p, signed: {} }))
    }
  }

  useEffect(() => {
    const off1 = window.api.onPhoneConnection(setPhoneConnected)
    const off2 = window.api.onPhoneSaved(({ studentKey }) => {
      updateProgress((p) => ({ ...p, signed: { ...p.signed, [studentKey]: true } }))
      setLastSaved({ key: studentKey, at: Date.now() })
    })
    return () => {
      off1()
      off2()
    }
  }, [])

  async function start(draft: WorkDraft) {
    try {
      const { workId, pdfs } = await window.api.createWork({
        workName: draft.workName,
        wholeGradeConfirmed: draft.wholeGradeConfirmed,
        view: draft.view,
        sourcePaths: draft.sourcePaths
      })
      setWork({ ...draft, workId, itemInfo: null, pdfClasses: pdfClassesOf(pdfs) })
      setProgressState(EMPTY)
      setListKey((k) => k + 1)
      setTab('check')
      return workId
    } catch {
      setError('작업을 저장하지 못했습니다. 디스크 공간과 권한을 확인하세요.')
      return null
    }
  }

  function updateProgress(fn: (p: Progress) => Progress) {
    setProgressState((prev) => {
      const next = fn(prev)
      const w = workRef.current
      if (w) window.api.saveProgress(w.workId, next).catch(() => setError('진행 상태를 저장하지 못했습니다.'))
      return next
    })
  }
  const setProgress = (p: Progress) => updateProgress(() => p)

  async function submitSignature(key: string, payload: SignaturePayload) {
    if (!work) return { ok: false, error: '작업이 없습니다.' }
    const r = await window.api.saveSignature(work.workId, key, payload)
    if (r.ok) {
      updateProgress((p) => ({ ...p, signed: { ...p.signed, [key]: true } }))
      setLastSaved({ key, at: Date.now() })
    }
    return r
  }

  // Development only: screenshot harness can jump straight to a student screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const h = async (e: Event) => {
      const { paths, key } = (e as CustomEvent<{ paths: string[]; key: string }>).detail
      const r = await window.api.importPaths(paths)
      if (!r.view) return
      await start({
        workName: '시험 작업',
        meta: r.view.meta,
        wholeGradeConfirmed: false,
        sourcePaths: paths,
        view: r.view
      })
      setDevOpen(key)
    }
    window.addEventListener('scorecheck:dev-student', h)
    return () => window.removeEventListener('scorecheck:dev-student', h)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={logo} alt="" />
          <span className="brand-ko">몇점</span>
          <span className="brand-en">ScoreCheck</span>
        </div>
        <nav className="tabs" aria-label="작업 단계">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''} ${t.id === 'analysis' ? 'aside' : ''}`}
              disabled={t.id !== 'import' && !work}
              onClick={() => setTab(t.id)}
            >
              {t.step && <span className="step">{t.step}</span>}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="local-badge" title="성적·서명 데이터는 이 PC 밖으로 나가지 않습니다.">
          로컬 전용
        </div>
      </header>

      <main className="content">
        <ErrorBoundary
          resetKey={tab}
          onHome={() => {
            void window.api.setStudentMode(false)
            setTab('import')
          }}
        >
        {tab === 'import' && (
          <>
            <WorkList currentId={work?.workId ?? null} onOpen={openWork} refreshKey={listKey} onChanged={onWorkChanged} />
            <ImportScreen onCreate={start} />
          </>
        )}
        {tab === 'check' && work && (
          <CheckScreen
            key={`${work.workId}-${devOpen ?? ''}`}
            initialStudent={devOpen}
            work={work}
            progress={progress}
            setProgress={setProgress}
            onSubmitSignature={submitSignature}
            phone={{ info: phoneInfo, connected: phoneConnected, setInfo: setPhoneInfo }}
            lastSaved={lastSaved}
          />
        )}
        {tab === 'pdf' && work && <PdfScreen work={work} progress={progress} />}
        {tab === 'analysis' && work && (
          <AnalysisScreen work={work} onInfoSaved={(itemInfo) => setWork((w) => (w ? { ...w, itemInfo } : w))} />
        )}
        {error && (
          <div className="toast" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        </ErrorBoundary>
      </main>
      <AppFooter />
    </div>
  )
}
