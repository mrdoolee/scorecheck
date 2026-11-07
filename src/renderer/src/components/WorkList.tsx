import { useEffect, useState } from 'react'
import type { WorkSummary } from '../../../shared/ipc'

function fmt(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type Pending = { w: WorkSummary; kind: 'work' | 'signatures' }

/** Works older than this get a gentle "정리 권장" note (there is no automatic delete). */
export const OLD_WORK_DAYS = 30

export function ageDays(createdAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 864e5))
}

export function WorkList({
  currentId,
  onOpen,
  refreshKey,
  onChanged
}: {
  currentId: string | null
  onOpen: (id: string) => void
  refreshKey: number
  onChanged: (id: string, change: 'deleted' | 'signatures-deleted') => void
}) {
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const reload = () => window.api.listWorks().then(setWorks)
  useEffect(() => {
    reload()
  }, [refreshKey])

  if (!works.length) return note ? <p className="hint small">{note}</p> : null
  const oldCount = works.filter((w) => ageDays(w.createdAt) >= OLD_WORK_DAYS).length

  async function confirm() {
    if (!pending) return
    setBusy(true)
    setError(null)
    const { w, kind } = pending
    const r = kind === 'work' ? await window.api.deleteWork(w.workId) : await window.api.deleteSignatures(w.workId)
    setBusy(false)
    if (!r.ok) return setError(r.error ?? '지우지 못했습니다.')
    setPending(null)
    onChanged(w.workId, kind === 'work' ? 'deleted' : 'signatures-deleted')
    setNote(kind === 'work' ? `'${w.workName}' 작업을 지웠습니다.` : `'${w.workName}'의 서명 ${w.signed}개를 지웠습니다.`)
    reload()
  }

  return (
    <section className="card">
      <h2>이전 작업</h2>
      {oldCount > 0 && (
        <p className="notice">
          만든 지 {OLD_WORK_DAYS}일이 지난 작업이 {oldCount}개 있습니다. 성적 처리(이의 신청 기간 등)가 끝났다면 서명 PDF를 저장했는지 확인하고 <b>작업 삭제</b>로 지워 주세요.
        </p>
      )}
      <table className="works">
        <thead>
          <tr>
            <th>작업</th>
            <th>서명</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {works.map((w) => (
            <tr key={w.workId} className={w.workId === currentId ? 'current' : ''}>
              <td>
                {w.workName}
                <div className="muted small">
                  만든 날 {fmt(w.createdAt)} · {ageDays(w.createdAt) === 0 ? '오늘' : `${ageDays(w.createdAt)}일 지남`}
                  {ageDays(w.createdAt) >= OLD_WORK_DAYS && <span className="tag age-tag">정리 권장</span>}
                </div>
              </td>
              <td>
                {w.signed}/{w.students}
              </td>
              <td className="right nowrap">
                <button className="btn" onClick={() => onOpen(w.workId)}>
                  {w.workId === currentId ? '열려 있음' : '열기'}
                </button>{' '}
                <button className="btn ghost danger" disabled={w.signed === 0} onClick={() => { setError(null); setPending({ w, kind: 'signatures' }) }} title={w.signed === 0 ? '받은 서명이 없습니다.' : '받은 서명만 지웁니다. 성적과 앱에 보관한 원본 사본은 남습니다.'}>
                  서명 삭제
                </button>{' '}
                <button className="btn ghost danger" onClick={() => { setError(null); setPending({ w, kind: 'work' }) }}>
                  작업 삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="hint small">{note}</p>}
      <p className="hint small">작업은 직접 지울 때까지 이 PC에 남습니다. 다른 위치에 저장한 PDF·xlsx는 지워지지 않습니다.</p>

      {pending && (
        <div className="modal-backdrop">
          <div className="modal">
            {pending.kind === 'work' ? (
              <>
                <p>
                  <b>{pending.w.workName}</b>의 성적·서명·문항정보와 앱에 보관한 원본 사본을 모두 지웁니다. 되돌릴 수 없습니다.
                </p>
                <p className="muted small">나이스에서 내려받은 원본 파일과 다른 위치에 저장한 PDF·xlsx는 그대로 남습니다.</p>
              </>
            ) : (
              <>
                <p>
                  <b>{pending.w.workName}</b>에서 받은 서명 {pending.w.signed}개를 지웁니다. 되돌릴 수 없습니다.
                </p>
                <p className="muted small">
                  성적·문항정보·원본 사본은 남고, 학생들은 '서명 대기'로 돌아갑니다. 서명 PDF를 먼저 저장했는지 확인하세요. 다른 위치에 저장한 PDF는 지워지지 않습니다.
                </p>
              </>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="row">
              <button className="btn ghost" disabled={busy} onClick={() => setPending(null)}>
                취소
              </button>
              <button className="btn primary danger-fill" disabled={busy} onClick={confirm}>
                {pending.kind === 'work' ? '작업 삭제' : '서명 삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
