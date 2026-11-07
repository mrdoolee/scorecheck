import { useEffect, useState, type DragEvent } from 'react'
import type { ExamMeta } from '../../../core/import/types'
import type { ImportResponse, ImportView } from '../../../shared/ipc'
import { menuText, NEIS_FILE_GROUPS } from '../../../shared/neis-files'

export interface WorkDraft {
  workName: string
  meta: ExamMeta
  wholeGradeConfirmed: boolean
  /** Every input file (xlsx + pdf); copied into the work folder on create. */
  sourcePaths: string[]
  view: ImportView
}

const KIND_LABEL: Record<string, string> = {
  'answer-sheet': '정기고사 정오표',
  'grade-summary': '학년 전체 일람표',
  'performance-class': '수행평가 일람표',
  pdf: '서명용 PDF'
}

function defaultName(m: ExamMeta, profile: string) {
  const parts = [
    m.schoolYear && `${m.schoolYear}`,
    m.semester && `${m.semester}학기`,
    m.grade && `${m.grade}학년`,
    m.subject,
    profile === 'performance' ? '수행평가' : m.examName
  ]
  return parts.filter(Boolean).join(' ')
}


export function ImportScreen({ onCreate }: { onCreate: (draft: WorkDraft) => unknown }) {
  const [paths, setPaths] = useState<string[]>([])
  const [res, setRes] = useState<ImportResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [meta, setMeta] = useState<ExamMeta>({})
  const [workName, setWorkName] = useState('')
  const [signOverride, setSignOverride] = useState<Record<string, boolean>>({})
  const [wholeGrade, setWholeGrade] = useState(false)

  async function load(next: string[]) {
    const unique = [...new Set(next)]
    setPaths(unique)
    setBusy(true)
    try {
      const r = await window.api.importPaths(unique)
      setRes(r)
      if (r.view) {
        setMeta(r.view.meta)
        setWorkName(defaultName(r.view.meta, r.view.profile))
      }
      setSignOverride({})
      setWholeGrade(false)
    } finally {
      setBusy(false)
    }
  }

  // Development only: lets the screenshot harness load files without a file dialog.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const h = (e: Event) => load((e as CustomEvent<string[]>).detail)
    window.addEventListener('scorecheck:dev-load', h)
    return () => window.removeEventListener('scorecheck:dev-load', h)
  })

  async function pick() {
    const picked = await window.api.pickFiles()
    if (picked.length) load([...paths, ...picked])
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean)
    if (dropped.length) load([...paths, ...dropped])
  }

  const view = res?.view ?? null
  const errors = res?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = res?.issues.filter((i) => i.level !== 'error' && i.code !== 'SPECIAL_STATUS') ?? []
  const specials = view?.students.filter((s) => s.specialStatus) ?? []

  const step2 = !!view && errors.length === 0
  const canCreate = step2 && workName.trim() !== ''

  function create() {
    if (!view) return
    const students = view.students.map((s) => (s.key in signOverride ? { ...s, signRequired: signOverride[s.key]! } : s))
    onCreate({
      workName: workName.trim(),
      meta,
      wholeGradeConfirmed: view.gradeCoverage.wholeGrade === true || wholeGrade,
      sourcePaths: paths,
      view: { ...view, meta, students }
    })
  }

  return (
    <div className="steps">
      {/* 1. 파일 넣기 */}
      <section className="card">
        <h2><span className="num">1</span>파일 넣기</h2>
        <p className="hint">
          나이스에서 아래 파일을 내려받아 이름을 바꾸지 말고 그대로 넣으세요. 여러 반의 파일을 한꺼번에 넣어도 됩니다.
        </p>
        <div className="neis-files">
          {NEIS_FILE_GROUPS.map((g) => (
            <div key={g.title} className="neis-group">
              <h3>{g.title}</h3>
              <ul>
                {g.files.map((f) => (
                  <li key={f.name + f.format}>
                    <div>
                      <span className={`tag ${f.need === '필수' ? 'need' : 'soft'}`}>{f.need}</span> <b>{f.name}</b>{' '}
                      <span className="format">{f.format}</span>
                    </div>
                    <div className="menu-path">{menuText(f)}</div>
                    <div className="muted small">{f.note}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p>여기로 파일을 끌어다 놓거나</p>
          <button className="btn" onClick={pick} disabled={busy}>
            파일 선택
          </button>
        </div>

        {res && (
          <div className="filelist">
            <table>
              <thead>
                <tr>
                  <th>파일</th>
                  <th>종류</th>
                  <th>반</th>
                </tr>
              </thead>
              <tbody>
                {res.files.map((f) => (
                  <tr key={f.fileName}>
                    <td className="mono">{f.fileName}</td>
                    <td>{KIND_LABEL[f.kind]}</td>
                    <td>{f.classNo ?? '-'}</td>
                  </tr>
                ))}
                {res.rejected.map((r) => (
                  <tr key={r.fileName} className="rejected">
                    <td className="mono">{r.fileName}</td>
                    <td colSpan={2}>넣지 못함 — {r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <span className="muted">
                {busy ? '읽는 중…' : `파일 ${paths.length}개`}
              </span>
              <button className="btn ghost" onClick={() => { setPaths([]); setRes(null) }}>
                모두 지우기
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. 평가 정보 */}
      <section className={`card ${view ? '' : 'locked'}`}>
        <h2><span className="num">2</span>평가 정보 확인</h2>
        {view ? (
          <>
            <p className="hint">파일에서 읽은 값입니다. 다르면 고치세요.</p>
            <div className="form-grid">
              <label className="wide">
                작업 이름
                <input value={workName} onChange={(e) => setWorkName(e.target.value)} />
              </label>
              <label>
                평가 종류
                <input value={view.profile === 'performance' ? '수행평가' : '정기고사'} readOnly />
              </label>
              <label>
                학년도
                <input type="number" value={meta.schoolYear ?? ''} onChange={(e) => setMeta({ ...meta, schoolYear: Number(e.target.value) })} />
              </label>
              <label>
                학기
                <input type="number" value={meta.semester ?? ''} onChange={(e) => setMeta({ ...meta, semester: Number(e.target.value) })} />
              </label>
              <label>
                학년
                <input type="number" value={meta.grade ?? ''} onChange={(e) => setMeta({ ...meta, grade: Number(e.target.value) })} />
              </label>
              <label>
                과목
                <input value={meta.subject ?? ''} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} />
              </label>
              {view.profile === 'regular-exam' && (
                <label>
                  고사
                  <input value={meta.examName ?? ''} onChange={(e) => setMeta({ ...meta, examName: e.target.value })} />
                </label>
              )}
            </div>
            <div className="summary-line">
              {view.classNos.length}개 반 · 학생 {view.students.length}명
              {view.profile === 'regular-exam' ? ` · ${view.items.length}문항` : ` · 평가 영역 ${view.areas.length - 1}개`}
            </div>
            {view.profile === 'performance' && (
              <table className="areas">
                <thead>
                  <tr><th>평가 영역</th><th>만점</th><th>반영 비율</th></tr>
                </thead>
                <tbody>
                  {view.areas.filter((a) => !a.isTotal).map((a) => (
                    <tr key={a.id}><td>{a.name}</td><td>{a.maxScore}</td><td>{a.weightPct}%</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="muted">파일을 넣으면 채워집니다.</p>
        )}
      </section>

      {/* 3. 검증 */}
      <section className={`card ${view ? '' : 'locked'}`}>
        <h2><span className="num">3</span>검증 결과</h2>
        {res && (
          <>
            {errors.length === 0 && view && (
              <p className="ok">
                {/* Only claim a NEIS cross-check when there was something to check against. */}
                {view.profile === 'performance' || view.gradeCoverage.wholeGrade === true
                  ? '나이스 집계(인원·총점·평균)와 모두 일치합니다.'
                  : '반별 정오표의 문항 정답·배점이 서로 일치합니다.'}
              </p>
            )}
            {res.issues.length === 0 && !view && <p className="muted">파일을 넣으면 검사합니다.</p>}
            {errors.length > 0 && (
              <div className="issues error">
                <b>고쳐야 다음으로 갈 수 있습니다</b>
                <ul>{errors.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="issues warn">
                <ul>{warnings.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
              </div>
            )}
            {view && view.gradeCoverage.wholeGrade !== true && (
              <label className="check">
                <input type="checkbox" checked={wholeGrade} onChange={(e) => setWholeGrade(e.target.checked)} />
                학년 전체 반을 모두 넣었습니다 (체크하지 않으면 학생 화면에 "학년 평균({view.classNos.length}개 반 기준)"으로 표시)
              </label>
            )}
            {specials.length > 0 && (
              <div className="specials">
                <b>점수 대신 글자가 있는 학생</b>
                <table>
                  <tbody>
                    {specials.map((s) => {
                      const required = signOverride[s.key] ?? s.signRequired
                      return (
                        <tr key={s.key}>
                          <td>{s.classNo}반 {s.number}번 {s.name}</td>
                          <td><span className="tag">{s.specialStatus}</span></td>
                          <td>
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={required}
                                onChange={(e) => setSignOverride({ ...signOverride, [s.key]: e.target.checked })}
                              />
                              서명 대상
                            </label>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <p className="hint small">
        작업은 직접 삭제할 때까지 이 PC에 남습니다. PDF를 저장한 뒤에는 첫 화면 <b>이전 작업</b>에서 <b>서명 삭제</b> 또는 <b>작업 삭제</b>를 하세요.
      </p>

      <div className="actions">
        <button className="btn primary big" disabled={!canCreate} onClick={create}>
          작업 만들기
        </button>
      </div>
    </div>
  )
}
