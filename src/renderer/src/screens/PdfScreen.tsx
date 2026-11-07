import { useEffect, useRef, useState } from 'react'
import { pdfjs } from '../components/pdfjs'
import type { Work } from '../App'
import type { Progress } from './CheckScreen'

type Composed = { bytes: Uint8Array; fileName: string; signed: number; missing: { number: number; name: string }[] }

function Preview({ bytes, zoom }: { bytes: Uint8Array; zoom: number }) {
  const holder = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const task = pdfjs.getDocument({ data: bytes.slice() })
    ;(async () => {
      const doc = await task.promise
      const el = holder.current
      if (!el || cancelled) return
      el.replaceChildren()
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const scale = ((el.clientWidth - 24) / base.width) * zoom
        const dpr = window.devicePixelRatio || 1
        const vp = page.getViewport({ scale: scale * dpr })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(vp.width)
        canvas.height = Math.floor(vp.height)
        canvas.style.width = `${Math.floor(vp.width / dpr)}px`
        canvas.className = 'pdf-page'
        el.appendChild(canvas)
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        if (cancelled) return
      }
    })().catch(() => {
      if (holder.current) holder.current.textContent = '미리보기를 표시하지 못했습니다.'
    })
    return () => {
      cancelled = true
      task.destroy()
    }
  }, [bytes, zoom])
  return <div className="pdf-holder" ref={holder} />
}

export function PdfScreen({ work, progress }: { work: Work; progress: Progress }) {
  const { view } = work
  const [classNo, setClassNo] = useState(view.classNos[0]!)
  const [composed, setComposed] = useState<Composed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [saved, setSaved] = useState<string[] | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<number[] | null>(null)

  const countFor = (c: number) => {
    const target = view.students.filter((s) => s.classNo === c && s.signRequired)
    return { signed: target.filter((s) => progress.signed[s.key]).length, total: target.length }
  }

  useEffect(() => {
    let alive = true
    setComposed(null)
    setError(null)
    setBusy(true)
    window.api.pdfCompose(work.workId, classNo).then((r) => {
      if (!alive) return
      setBusy(false)
      if (r.ok) setComposed(r)
      else setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [classNo, work.workId, progress])

  async function save(classNos: number[]) {
    setConfirm(null)
    setSaved(null)
    setSkipped([])
    setSaveError(null)
    setSaving(true)
    try {
      const r = await window.api.pdfSave(work.workId, classNos)
      if (r.ok && r.paths) {
        setSaved(r.paths)
        setSkipped(r.skipped ?? [])
      } else if (!r.canceled) setSaveError(r.error ?? '저장하지 못했습니다.')
    } catch {
      setSaveError('PDF를 저장하지 못했습니다. 다시 시도하세요.')
    } finally {
      setSaving(false)
    }
  }

  function askSave(classNos: number[]) {
    const unsigned = classNos.some((c) => {
      const n = countFor(c)
      return n.signed < n.total
    })
    if (unsigned) setConfirm(classNos)
    else save(classNos)
  }

  return (
    <div className="pdf-screen">
      <aside className="card pdf-side">
        <h2>반 선택</h2>
        <ul className="class-list">
          {view.classNos.map((c) => {
            const n = countFor(c)
            return (
              <li key={c}>
                <button className={`class-item ${c === classNo ? 'active' : ''}`} onClick={() => setClassNo(c)}>
                  <span>{c}반</span>
                  <span className={n.signed === n.total ? 'ok' : 'muted'}>
                    서명 {n.signed}/{n.total}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <button className="btn" onClick={() => askSave(view.classNos)} disabled={saving}>
          모든 반 PDF 저장…
        </button>
        <p className="hint small">
          저장할 때마다 원본 일람표에서 새로 만듭니다. 원본 PDF는 바뀌지 않습니다. 앱 밖에 저장한 PDF는 작업을 지워도 남습니다.
        </p>
      </aside>

      <section className="card pdf-main">
        <div className="row pdf-toolbar">
          <b>{classNo}반 미리보기</b>
          <span className="muted">{composed ? `서명 ${composed.signed}명 들어감` : busy ? '만드는 중…' : ''}</span>
          <button className="btn ghost" onClick={() => setZoom(zoom === 1 ? 2 : 1)}>
            {zoom === 1 ? '크게 보기' : '전체 보기'}
          </button>
          <button className="btn primary" disabled={!composed || saving} onClick={() => askSave([classNo])}>
            {saving ? '저장 중…' : '이 반 PDF 저장…'}
          </button>
        </div>
        {composed && composed.missing.length > 0 && (
          <div className="issues warn">
            서명하지 않은 학생 {composed.missing.length}명: {composed.missing.slice(0, 8).map((m) => `${m.number}번`).join(', ')}
            {composed.missing.length > 8 && ` 외 ${composed.missing.length - 8}명`}
          </div>
        )}
        {error && <div className="issues error">{error}</div>}
        {saveError && <div className="issues error pre-line">{saveError}</div>}
        {skipped.length > 0 && (
          <div className="issues warn">
            저장하지 못한 반이 있습니다:
            <ul>
              {skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {saved && (
          <div className="issues okbox">
            저장했습니다:
            <ul>
              {saved.map((p) => (
                <li key={p}>
                  <button className="linklike" onClick={() => window.api.showInFolder(p)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className={`pdf-scroll ${zoom > 1 ? 'zoomed' : ''}`}>{composed && <Preview bytes={composed.bytes} zoom={zoom} />}</div>
      </section>

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <p>서명하지 않은 학생이 있습니다. 비고칸을 비운 채로 저장할까요?</p>
            <div className="row">
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                취소
              </button>
              <button className="btn primary" onClick={() => save(confirm)}>
                그대로 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
