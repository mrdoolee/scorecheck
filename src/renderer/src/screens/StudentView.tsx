import { useEffect, useMemo, useRef, useState } from 'react'
import { describeMark, feedbackFor } from '../../../core/feedback/feedback'
import { compare, itemCorrectRates, type Comparison } from '../../../core/stats/display'
import type { StudentRecord } from '../../../core/import/types'
import type { ImportView } from '../../../shared/ipc'
import { SignPad } from '../components/SignPad'
import { RowPreview } from '../components/RowPreview'
import { deep, pastel, pastelGradient } from '../components/scale'
import { canvasAspect, type SignaturePayload } from '../../../core/signature/signature'
import type { ItemInfo } from '../../../core/item-analysis/info'

function fmt(v: number | null, d = 1) {
  return v === null ? '-' : v.toFixed(d)
}

function DiffText({ label, diff }: { label: string; diff: number | null }) {
  if (diff === null) return null
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'
  const text = diff > 0 ? `${diff.toFixed(1)}점 높아요` : diff < 0 ? `${Math.abs(diff).toFixed(1)}점 낮아요` : '같아요'
  return (
    <div className={`diff ${cls}`}>
      {label}보다 <b>{text}</b>
    </div>
  )
}

function Bars({ c, gradeLabel }: { c: Comparison; gradeLabel: string }) {
  const max = c.maxScore ?? Math.max(c.score ?? 0, c.classMean ?? 0, c.gradeMean ?? 0, 1)
  const rows: { label: string; value: number | null; sd?: number | null; me?: boolean }[] = [
    { label: '나', value: c.score, me: true },
    { label: '학급 평균', value: c.classMean, sd: c.classSd },
    { label: gradeLabel, value: c.gradeMean, sd: c.gradeSd }
  ]
  return (
    <div className="bars">
      {rows.map((r) => {
        const ratio = Math.max(0, Math.min(1, (r.value ?? 0) / max))
        const fill = r.me ? `linear-gradient(90deg, ${pastel(ratio)}, ${deep(ratio)})` : pastel(ratio)
        return (
          <div key={r.label} className={`bar-row ${r.me ? 'me' : ''}`}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${ratio * 100}%`, background: fill }} />
            </span>
            <span className="bar-value">
              {fmt(r.value)}
              {r.sd !== undefined && r.sd !== null && <small> (표준편차 {fmt(r.sd)})</small>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function StudentView({
  view,
  student,
  title,
  gradeLabel,
  checked,
  signed,
  signRequired,
  onChecked,
  onSubmitSignature,
  phoneConnected,
  onPhoneRequest,
  lastSavedAt,
  onExit,
  onNext,
  nextLabel,
  onPrev,
  prevLabel,
  itemInfo = null,
  workId,
  hasPdf
}: {
  /** False when this class has no 일람표 PDF: the signature would have nowhere to go, so signing is blocked. */
  hasPdf: boolean
  /** Used to show the student's row of the original 일람표 before signing. */
  workId: string
  onNext: () => void
  nextLabel: string | null
  onPrev: () => void
  prevLabel: string | null
  phoneConnected: boolean
  /** `rowImage`: the student's cut-out of the original 일람표, shown on top of the phone signing page. */
  onPhoneRequest: (rowImage: string | null) => Promise<{ ok: boolean; error?: string }>
  lastSavedAt: number
  view: ImportView
  student: StudentRecord
  title: string
  gradeLabel: string
  checked: boolean
  signed: boolean
  signRequired: boolean
  onChecked: () => void
  onSubmitSignature: (p: SignaturePayload) => Promise<{ ok: boolean; error?: string }>
  onExit: () => void
  /** Optional 문항정보: adds the 내용영역 to item tiles and one feedback line. */
  itemInfo?: ItemInfo | null
}) {
  const [stage, setStage] = useState<'view' | 'sign' | 'phone' | 'done'>('view')
  const requestedAt = useRef(0)
  const rowImage = useRef<string | null>(null)

  // A save from the phone for this student (after we asked) finishes the signing step.
  useEffect(() => {
    if (stage === 'phone' && lastSavedAt > requestedAt.current) setStage('done')
  }, [lastSavedAt, stage])

  async function startSigning() {
    setSaveError(null)
    if (!phoneConnected) return setStage('sign')
    requestedAt.current = Date.now() - 1
    const r = await onPhoneRequest(rowImage.current)
    if (r.ok) setStage('phone')
    else {
      setSaveError(r.error ?? '휴대폰에 서명 요청을 보내지 못했습니다.')
      setStage('sign')
    }
  }
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function submit(p: SignaturePayload) {
    setSaving(true)
    setSaveError(null)
    try {
      const r = await onSubmitSignature(p)
      if (r.ok) setStage('done')
      else setSaveError(r.error ?? '저장하지 못했습니다. 다시 제출해 주세요.')
    } catch {
      setSaveError('저장하지 못했습니다. 다시 제출해 주세요.')
    } finally {
      setSaving(false)
    }
  }
  const comps = useMemo(() => compare(view, student), [view, student])
  const rates = useMemo(() => itemCorrectRates(view.students, view.items.length), [view])
  const feedback = useMemo(() => feedbackFor(view.profile, student, comps, view.items, rates, undefined, itemInfo, gradeLabel), [view, student, comps, rates, itemInfo, gradeLabel])
  const total = comps.find((c) => c.areaId === 'total')!
  const parts = comps.filter((c) => c.areaId !== 'total')

  return (
    <div className="student-view">
      <header className="sv-head">
        <div>
          <div className="sv-title">{title}</div>
          <div className="sv-name">
            {student.classNo}반 {student.number}번 <b>{student.name}</b>
            {signed && stage === 'view' && <span className="signed-badge">✓ 서명 완료</span>}
          </div>
        </div>
        <div className="sv-controls">
          <button className="sv-control" onClick={onPrev} disabled={!prevLabel} title={prevLabel ? `이전 학생 ${prevLabel}` : '반 첫 학생'}>
            <span className="sv-control-icon" aria-hidden="true">◀</span>
            <span>{prevLabel ? `이전 ${prevLabel}` : '처음'}</span>
          </button>
          <button className="sv-control" onClick={onNext} title={nextLabel ? `다음 학생 ${nextLabel}` : '반 마지막 학생 — 목록으로'}>
            <span className="sv-control-icon" aria-hidden="true">▶</span>
            <span>{nextLabel ? `다음 ${nextLabel}` : '목록으로'}</span>
          </button>
          <button className="sv-control" onClick={onExit} title="교사 화면으로">
            <span className="sv-control-icon" aria-hidden="true">🔒</span>
            <span>교사 화면</span>
          </button>
        </div>
      </header>

      {/* Right under the name, from the first look at the scores through signing (kept mounted across stages). */}
      {stage !== 'done' && <RowPreview workId={workId} studentKey={student.key} onImage={(d) => (rowImage.current = d)} />}

      {stage === 'phone' && (
        <section className="sv-card sv-done">
          <div className="phone-wait" aria-hidden="true">📱</div>
          <p>선생님 휴대폰에 서명하세요.</p>
          <p className="muted">서명이 PC에 저장되면 이 화면이 바뀝니다.</p>
          {!phoneConnected && <p className="error-text">휴대폰 연결이 끊겼습니다. 휴대폰 화면을 새로 고침하거나 PC 화면에 서명하세요.</p>}
          <div className="row center">
            <button className="btn ghost" onClick={() => setStage('view')}>
              성적 다시 보기
            </button>
            <button className="btn ghost" onClick={() => { window.api.phoneIdle(); setStage('sign') }}>
              PC 화면에 서명
            </button>
          </div>
        </section>
      )}

      {stage === 'sign' && (
        <section className="sv-card sv-sign">
          <h3>성적을 확인했다면 아래에 서명하세요</h3>
          <p className="hint">서명은 일람표 비고칸 크기에 맞춰 작게 들어갑니다. 칸을 넉넉히 채워 쓰세요.</p>
          <SignPad aspect={canvasAspect(view.cellAspect, view.profile)} onSubmit={submit} busy={saving} />
          {saveError && <p className="error-text">{saveError}</p>}
          <div className="row center">
            <button className="btn ghost" onClick={() => setStage('view')} disabled={saving}>
              성적 다시 보기
            </button>
          </div>
        </section>
      )}

      {stage === 'done' && (
        <section className="sv-card sv-done">
          <div className="done-mark">✓</div>
          <p>서명이 저장되었어요. 선생님께 알려 주세요.</p>
        </section>
      )}

      {stage !== 'view' ? null : student.specialStatus ? (
        <section className="sv-card">
          <p className="sv-special">이 학생은 '{student.specialStatus}'로 표시되어 있어 점수가 없습니다.</p>
        </section>
      ) : (
        <>
          <section className="sv-card sv-total">
            <div className="sv-score">
              <span className="big">{fmt(total.score)}</span>
              <span className="of">/ {total.maxScore ?? '-'}점</span>
            </div>
            <div className="sv-diffs">
              <DiffText label="학급 평균" diff={total.diffClass} />
              <DiffText label={gradeLabel} diff={total.diffGrade} />
            </div>
            <Bars c={total} gradeLabel={gradeLabel} />
          </section>

          {feedback.length > 0 && (
            <section className="sv-card sv-feedback">
              <h3>한 줄 피드백</h3>
              <ul>{feedback.map((f) => <li key={f}>{f}</li>)}</ul>
            </section>
          )}

          {view.profile === 'performance' && (
            <section className="sv-grid">
              {parts.map((c) => (
                <div className="sv-card sv-area" key={c.areaId}>
                  <h3>{c.areaName}</h3>
                  <div className="sv-score small">
                    <span className="big">{fmt(c.score)}</span>
                    <span className="of">/ {c.maxScore ?? '-'}점</span>
                  </div>
                  <Bars c={c} gradeLabel={gradeLabel} />
                </div>
              ))}
            </section>
          )}

          {view.profile === 'regular-exam' && student.responses && (
            <section className="sv-card">
              <div className="items-head">
                <h3>문항별 결과</h3>
                <span className="rate-legend" title={`함께 시험 본 ${view.classNos.length}개 반 전체 정답률`}>
                  정답률 낮음 <span className="rate-scale" aria-hidden="true" style={{ background: pastelGradient }} /> 높음
                </span>
              </div>
              <div className="items">
                {student.responses.map((m, i) => {
                  const item = view.items[i]!
                  const d = describeMark(m, item.answer)
                  const pct = Math.round((rates[i] ?? 0) * 100)
                  const area = itemInfo?.rows[i]?.area.trim() ?? ''
                  return (
                    <div
                      key={i}
                      className={`item ${d.ok ? 'ok' : 'ng'}`}
                      style={{ background: pastel(rates[i] ?? 0) }}
                      title={`${item.no}번${area ? ` ${area}` : ''} · 정답률 ${pct}%`}
                    >
                      <span className="item-top">
                        <span className="no">{item.no}</span>
                        <span className="mark">{d.ok ? 'O' : 'X'}</span>
                      </span>
                      {area && <span className="item-area">{area}</span>}
                      {!d.ok && (
                        <span className="ans">
                          정답 {item.answer} · 내답 {d.mine}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

        </>
      )}

      {stage === 'view' && (
        <footer className="sv-foot">
          {!checked ? (
            <button className="btn primary big" onClick={onChecked}>
              성적을 확인했어요
            </button>
          ) : signRequired && !hasPdf ? (
            <span className="muted">이 반은 일람표 PDF가 없어 서명을 받지 않습니다. 선생님께 알려 주세요.</span>
          ) : signRequired ? (
            <button className="btn primary big" onClick={startSigning}>
              {signed ? '다시 서명하기' : '서명하기'}
            </button>
          ) : (
            <span className="muted">서명 대상이 아닙니다.</span>
          )}
        </footer>
      )}

    </div>
  )
}
