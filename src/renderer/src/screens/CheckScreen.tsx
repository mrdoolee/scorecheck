import { useState } from 'react'
import type { Work } from '../App'
import { StudentView } from './StudentView'
import { maskName, PhonePanel, type PhoneInfo } from '../components/PhonePanel'
import { canvasAspect } from '../../../core/signature/signature'
import type { SignaturePayload } from '../../../core/signature/signature'

export type SignStatus = '서명 대기' | '서명 완료' | '서명 제외'

export interface Progress {
  checked: Record<string, boolean>
  signed: Record<string, boolean>
}

export function signStatusOf(work: Work, progress: Progress, key: string): SignStatus {
  const s = work.view.students.find((x) => x.key === key)
  if (s && !s.signRequired) return '서명 제외'
  return progress.signed[key] ? '서명 완료' : '서명 대기'
}

export function CheckScreen({
  work,
  progress,
  setProgress,
  onSubmitSignature,
  phone,
  lastSaved,
  initialStudent = null
}: {
  phone: { info: PhoneInfo | null; connected: boolean; setInfo: (i: PhoneInfo | null) => void }
  lastSaved: { key: string; at: number } | null
  initialStudent?: string | null
  work: Work
  progress: Progress
  setProgress: (p: Progress) => void
  onSubmitSignature: (key: string, p: SignaturePayload) => Promise<{ ok: boolean; error?: string }>
}) {
  const { view } = work
  const [classNo, setClassNo] = useState(view.classNos[0]!)
  const [current, setCurrent] = useState<string | null>(initialStudent)
  const [onlyPending, setOnlyPending] = useState(false)

  const gradeLabel =
    view.gradeCoverage.wholeGrade === true || work.wholeGradeConfirmed
      ? '학년 평균'
      : `학년 평균(${view.gradeCoverage.classNos.length}개 반 기준)`

  const students = view.students
    .filter((s) => s.classNo === classNo)
    .filter((s) => !onlyPending || signStatusOf(work, progress, s.key) === '서명 대기')
  const student = current ? view.students.find((s) => s.key === current) : null

  async function open(key: string) {
    setCurrent(key)
    await window.api.setStudentMode(true)
  }
  async function close() {
    setCurrent(null)
    window.api.phoneIdle()
    await window.api.setStudentMode(false)
  }

  /** Next student in the same class who still needs a signature (skips signed and excluded students). */
  function nextAfter(key: string) {
    const cur = view.students.find((s) => s.key === key)
    if (!cur) return null
    return (
      view.students
        .filter((s) => s.classNo === cur.classNo && s.number > cur.number && s.signRequired)
        .find((s) => signStatusOf(work, progress, s.key) !== '서명 완료') ?? null
    )
  }

  /** Previous student in the same class (any status, so a signed student can be reviewed or re-signed). */
  function prevBefore(key: string) {
    const cur = view.students.find((s) => s.key === key)
    if (!cur) return null
    const before = view.students.filter((s) => s.classNo === cur.classNo && s.number < cur.number)
    return before.length ? before.reduce((a, b) => (b.number > a.number ? b : a)) : null
  }

  function goPrev() {
    if (!current) return
    const prev = prevBefore(current)
    window.api.phoneIdle()
    if (prev) setCurrent(prev.key)
  }

  async function goNext() {
    if (!current) return
    const next = nextAfter(current)
    window.api.phoneIdle()
    if (next) setCurrent(next.key)
    else await close()
  }

  if (student) {
    const next = nextAfter(student.key)
    const prev = prevBefore(student.key)
    return (
      <StudentView
        key={student.key /* fresh state per student: nothing from the previous student survives */}
        view={view}
        student={student}
        title={work.workName}
        gradeLabel={gradeLabel}
        checked={!!progress.checked[student.key]}
        signed={!!progress.signed[student.key]}
        signRequired={student.signRequired}
        onChecked={() => setProgress({ ...progress, checked: { ...progress.checked, [student.key]: true } })}
        onSubmitSignature={(p) => onSubmitSignature(student.key, p)}
        phoneConnected={phone.connected}
        onPhoneRequest={(rowImage) =>
          window.api.phoneRequest(
            work.workId,
            student.key,
            `${student.classNo}반 ${student.number}번 ${maskName(student.name)}`,
            canvasAspect(view.cellAspect, view.profile),
            rowImage
          )
        }
        lastSavedAt={lastSaved?.key === student.key ? lastSaved.at : 0}
        onExit={close}
        onNext={goNext}
        nextLabel={next ? `${next.number}번` : null}
        onPrev={goPrev}
        prevLabel={prev ? `${prev.number}번` : null}
        itemInfo={work.itemInfo}
        workId={work.workId}
        hasPdf={work.pdfClasses.includes(student.classNo)}
      />
    )
  }

  const inClass = view.students.filter((s) => s.classNo === classNo)
  const done = inClass.filter((s) => signStatusOf(work, progress, s.key) === '서명 완료').length
  const target = inClass.filter((s) => s.signRequired).length

  return (
    <div className="steps">
      <section className="card">
        <PhonePanel connected={phone.connected} info={phone.info} onInfoChange={phone.setInfo} />
      </section>
      <section className="card">
        <div className="class-tabs">
          {view.classNos.map((c) => (
            <button key={c} className={`chip ${c === classNo ? 'active' : ''}`} onClick={() => setClassNo(c)}>
              {c}반
            </button>
          ))}
        </div>
        {!work.pdfClasses.includes(classNo) && (
          <div className="issues warn">
            {classNo}반 일람표 PDF를 넣지 않아 서명을 받을 수 없습니다. 학생 화면에서 성적 확인만 됩니다. 서명을 받으려면 ① 성적 입력에서 {classNo}반 PDF까지 함께 넣어 작업을 다시 만드세요.
          </div>
        )}
        <div className="row">
          <span className="muted">
            {classNo}반 서명 {done} / {target}명
          </span>
          <label className="check">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            서명 안 한 학생만
          </label>
        </div>
        <table className="students">
          <thead>
            <tr>
              <th>번호</th>
              <th>이름</th>
              <th>성적 확인</th>
              <th>서명</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const st = signStatusOf(work, progress, s.key)
              return (
                <tr key={s.key}>
                  <td>{s.number}</td>
                  <td>
                    {s.name} {s.specialStatus && <span className="tag">{s.specialStatus}</span>}
                  </td>
                  <td>{progress.checked[s.key] ? '확인함' : '-'}</td>
                  <td>
                    <span className={`status s-${st}`}>{st === '서명 완료' ? `✓ ${st}` : st}</span>
                  </td>
                  <td className="right">
                    <button className="btn" onClick={() => open(s.key)}>
                      학생 화면 열기
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="hint small">
          학생 화면에서는 다른 학생 정보와 메뉴가 보이지 않습니다. 오른쪽 위 ◀ ▶로 이전·다음 학생, 🔒로 교사 화면에 돌아옵니다. ▶는 이미 서명한 학생을 건너뜁니다.
        </p>
      </section>
    </div>
  )
}
