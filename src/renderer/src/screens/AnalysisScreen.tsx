// Teacher-only 문항 분석 tab. Never reachable from the student screen (the student view covers the whole window).
import { useMemo, useState } from 'react'
import type { Work } from '../App'
import {
  areaStats,
  classRows,
  examTakers,
  fullSummary,
  histogram,
  infoGroupStats,
  itemStats,
  LOW_DISCRIMINATION,
  type Bin,
  type ItemStat
} from '../../../core/item-analysis/analysis'
import {
  applyColumn,
  columnText,
  emptyInfo,
  FIELD_LABEL,
  hasAnyInfo,
  parseColumn,
  type InfoField,
  type ItemInfo
} from '../../../core/item-analysis/info'
import { pastel } from '../components/scale'

const f1 = (v: number | null | undefined) => (v == null ? '-' : v.toFixed(1))
const pc = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v * 100)}%`)

function Histogram({ bins, label }: { bins: Bin[]; label: string }) {
  const max = Math.max(1, ...bins.map((b) => b.count))
  const W = 560
  const H = 150
  const bw = W / bins.length
  return (
    <figure className="histo">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`${label} 점수 분포`}>
        {bins.map((b, i) => {
          const h = (b.count / max) * (H - 18)
          return (
            <g key={i}>
              <rect x={i * bw + 3} y={H - h} width={bw - 6} height={h} rx={4} fill={pastel((i + 0.5) / bins.length)} />
              {b.count > 0 && (
                <text x={i * bw + bw / 2} y={H - h - 4} textAnchor="middle" className="histo-n">
                  {b.count}
                </text>
              )}
              <text x={i * bw + bw / 2} y={H + 15} textAnchor="middle" className="histo-x">
                {Math.round(b.from)}
              </text>
            </g>
          )
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="histo-axis" />
      </svg>
      <figcaption className="muted small">{label} — 구간 시작 점수별 인원</figcaption>
    </figure>
  )
}

function RateBar({ v }: { v: number }) {
  return (
    <span className="rate-bar" title={pc(v)}>
      <span style={{ width: `${Math.round(v * 100)}%`, background: pastel(v) }} />
      <em>{pc(v)}</em>
    </span>
  )
}

function ChoiceBar({ s }: { s: ItemStat }) {
  return (
    <span className="choice-bar">
      {s.choices
        .filter((c) => c.count > 0)
        .map((c) => (
          <span
            key={c.key}
            className={`seg ${c.correct ? 'correct' : ''} ${c.attractive ? 'attractive' : ''} ${c.key === '무응답' ? 'none' : ''}`}
            style={{ flexGrow: c.share }}
            title={`${c.label} ${pc(c.share)}${c.correct ? ' (정답)' : ''}`}
          >
            {c.share >= 0.08 ? c.key.replace('무응답', '−') : ''}
          </span>
        ))}
    </span>
  )
}

// ---------------------------------------------------------------- 문항정보 입력

function InfoEditor({ work, onSaved }: { work: Work; onSaved: (info: ItemInfo | null) => void }) {
  const n = work.view.items.length
  const stored = work.itemInfo ?? emptyInfo(n)
  const fields: InfoField[] = ['area', 'standard']
  const [text, setText] = useState<Record<InfoField, string>>(() => ({
    area: columnText(stored, 'area').replace(/\n+$/, ''),
    standard: columnText(stored, 'standard').replace(/\n+$/, '')
  }))
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => Object.fromEntries(fields.map((f) => [f, parseColumn(f, text[f], n)])) as Record<InfoField, ReturnType<typeof parseColumn>>, [text, n])
  const draft = useMemo(() => fields.reduce((acc, f) => applyColumn(acc, f, parsed[f].values), emptyInfo(n)), [parsed, n])
  const dirty = JSON.stringify(draft.rows) !== JSON.stringify(stored.rows)

  async function save(info: ItemInfo | null) {
    setBusy(true)
    setMsg(null)
    const r = await window.api.itemInfoSave(work.workId, info && hasAnyInfo(info) ? info : null)
    setBusy(false)
    if (!r.ok) return setMsg(r.error ?? '저장하지 못했습니다.')
    onSaved(info && hasAnyInfo(info) ? { ...info, updatedAt: new Date().toISOString() } : null)
    setMsg(info && hasAnyInfo(info) ? '저장했습니다. 학생 화면 피드백과 문항 분석에 반영됩니다.' : '문항정보를 지웠습니다.')
  }

  return (
    <section className="card">
      <h2>문항정보 입력 <span className="tag soft">선택</span></h2>
      <p className="hint">
        학교마다 문항정보표 양식이 달라 파일을 읽지 않고 붙여넣기로 받습니다. 문항정보표에서 <b>한 열씩</b> 복사해 아래 칸에 붙여 넣으세요.
        <b> 한 줄이 한 문항</b>이고, 1번 문항부터 차례로 들어갑니다. 정답·배점은 나이스 파일 값을 씁니다. 비워 두어도 다른 기능은 모두 쓸 수 있습니다.
      </p>
      <div className="info-cols">
        {fields.map((f) => {
          const p = parsed[f]
          const ok = p.lineCount === n
          return (
            <label key={f} className={`info-col info-${f}`}>
              <span className="info-col-head">
                <b>{FIELD_LABEL[f]}</b>
                <span className={`count ${p.lineCount === 0 ? '' : ok ? 'ok' : 'warn'}`}>
                  {p.lineCount}줄 / {n}문항
                </span>
              </span>
              <textarea
                value={text[f]}
                spellCheck={false}
                wrap="off"
                rows={Math.min(Math.max(n, 8), 26)}
                placeholder={f === 'area' ? '물질의 특성\n밀도\n용해도\n…' : '[9과08-01] 물질의 특성의 …\n[9과08-01]\n…'}
                onChange={(e) => setText({ ...text, [f]: e.target.value })}
              />
              {p.warnings.map((w) => (
                <span key={w} className="info-warn">
                  {w}
                </span>
              ))}
            </label>
          )
        })}
      </div>
      <p className="hint small">
        성취기준이 코드([9과08-01])로 시작하면, 코드 없이 시작하는 줄은 윗줄 문장에 이어 붙입니다(PDF에서 복사할 때 긴 문장이 두 줄로 나뉘는 경우).
      </p>

      <details className="info-preview" open={dirty}>
        <summary>문항별로 맞춰 보기</summary>
        <table className="compact">
          <thead>
            <tr>
              <th>문항</th>
              <th>내용영역</th>
              <th>성취기준</th>
              <th>정답</th>
              <th>배점</th>
            </tr>
          </thead>
          <tbody>
            {work.view.items.map((it, i) => {
              const r = draft.rows[i]!
              return (
                <tr key={i}>
                  <td>{it.no}</td>
                  <td>{r.area || <span className="muted">-</span>}</td>
                  <td className="std">{r.standard || <span className="muted">-</span>}</td>
                  <td>{it.answer}</td>
                  <td>{it.points ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>

      <div className="row">
        <span className="muted">{msg ?? (dirty ? '저장하지 않은 변경이 있습니다.' : work.itemInfo ? '저장된 문항정보입니다.' : '아직 문항정보가 없습니다.')}</span>
        {work.itemInfo && (
          <button className="btn ghost danger" disabled={busy} onClick={() => { setText({ area: '', standard: '' }); void save(null) }}>
            모두 지우기
          </button>
        )}
        <button className="btn primary" disabled={busy || !dirty} onClick={() => save(draft)}>
          저장
        </button>
      </div>
    </section>
  )
}

function InfoGroups({ work, info }: { work: Work; info: ItemInfo }) {
  const { view } = work
  return (
    <section className="card">
      <h2>문항정보별 득점률</h2>
      <p className="hint small">득점률 = 맞힌 문항 배점 합 ÷ 해당 문항 배점 합 (가져온 반 응시자 전체).</p>
      {(['area', 'standard'] as InfoField[]).map((field) => {
        const groups = infoGroupStats(view.students, view.items, view.classNos, info, field)
        if (!groups.length) return null
        return (
          <div key={field} className="group-block">
            <h3>{FIELD_LABEL[field]}별</h3>
            <div className="scroll-x">
              <table className="compact">
                <thead>
                  <tr>
                    <th>{FIELD_LABEL[field]}</th>
                    <th>문항</th>
                    <th>전체</th>
                    {view.classNos.map((c) => (
                      <th key={c} className="numc">{c}반</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key}>
                      <td className={field === 'standard' ? 'std' : ''}>{g.label}</td>
                      <td className="muted nowrap">{g.items.map((i) => view.items[i]?.no ?? i + 1).join(', ')}</td>
                      <td><RateBar v={g.scoreRate} /></td>
                      {view.classNos.map((c) => (
                        <td key={c} className="numc heat" style={{ background: pastel(g.classRates[c] ?? 0) }}>
                          {pc(g.classRates[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </section>
  )
}

// ---------------------------------------------------------------- 정기고사

type ExamView = 'summary' | 'items' | 'classes' | 'info'
type Sort = 'no' | 'rate' | 'disc'

function ExamAnalysis({ work, onInfoSaved }: { work: Work; onInfoSaved: (info: ItemInfo | null) => void }) {
  const { view } = work
  const [sub, setSub] = useState<ExamView>('summary')
  const [sort, setSort] = useState<Sort>('no')
  const [scope, setScope] = useState<number | 'all'>('all')
  const info = hasAnyInfo(work.itemInfo) ? work.itemInfo : null

  const takers = useMemo(() => examTakers(view.students), [view])
  const stats = useMemo(() => itemStats(view.students, view.items, view.classNos), [view])
  const rows = useMemo(() => classRows(takers, view.classNos, 'total'), [takers, view])
  const full = view.areas[0]?.maxScore ?? 100
  const scoped = scope === 'all' ? takers : takers.filter((s) => s.classNo === scope)
  const scopedTotals = scoped.map((s) => s.scores['total'] as number)
  const sum = fullSummary(scopedTotals)

  const sorted = [...stats].sort((a, b) =>
    sort === 'rate' ? a.rate - b.rate : sort === 'disc' ? (a.discrimination ?? 9) - (b.discrimination ?? 9) : a.index - b.index
  )

  return (
    <>
      <div className="class-tabs sub-tabs">
        {(
          [
            ['summary', '시험 요약'],
            ['items', '문항별'],
            ['classes', '반별 비교'],
            ['info', info ? '문항정보' : '문항정보 입력 (선택)']
          ] as [ExamView, string][]
        ).map(([id, label]) => (
          <button key={id} className={`chip ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>
            {label}
          </button>
        ))}
      </div>

      {sub === 'summary' && (
        <section className="card">
          <h2>시험 요약</h2>
          <div className="class-tabs">
            <button className={`chip small ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>
              전체 ({view.classNos.length}개 반)
            </button>
            {view.classNos.map((c) => (
              <button key={c} className={`chip small ${scope === c ? 'active' : ''}`} onClick={() => setScope(c)}>
                {c}반
              </button>
            ))}
          </div>
          <div className="stat-tiles">
            <div><span>응시자</span><b>{sum.count}명</b></div>
            <div><span>평균</span><b>{f1(sum.mean)}</b></div>
            <div><span>표준편차</span><b>{f1(sum.sd)}</b></div>
            <div><span>최고</span><b>{f1(sum.max)}</b></div>
            <div><span>최저</span><b>{f1(sum.min)}</b></div>
            <div><span>중앙값</span><b>{f1(sum.median)}</b></div>
          </div>
          <Histogram bins={histogram(scopedTotals, full, 10)} label={scope === 'all' ? '전체' : `${scope}반`} />
          <p className="hint small">
            응시자는 정오표에 총점이 있는 학생입니다(전출 등 제외). 표준편차는 모표준편차입니다. 정오표를 가져온 반만 계산하므로 학년 전체 일람표의 학년 평균과 다를 수 있습니다.
          </p>
        </section>
      )}

      {sub === 'items' && (
        <section className="card">
          <h2>문항별 분석</h2>
          <div className="row">
            <span className="muted">
              정답률 낮은 문항, 변별도 {LOW_DISCRIMINATION} 미만(<span className="flag">낮음</span>)·음수 문항, 매력적인 오답(<span className="seg-key attractive" />)을 확인하세요.
            </span>
            <label className="sort">
              정렬
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="no">문항 번호</option>
                <option value="rate">정답률 낮은 순</option>
                <option value="disc">변별도 낮은 순</option>
              </select>
            </label>
          </div>
          <div className="scroll-x">
            <table className="compact items-table">
              <thead>
                <tr>
                  <th>문항</th>
                  {info && <th>내용영역</th>}
                  <th>정답</th>
                  <th>배점</th>
                  <th>정답률</th>
                  <th title="상위 27% 정답률 − 하위 27% 정답률">변별도</th>
                  <th>선택지 분포</th>
                  <th>무응답·복수</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const r = info?.rows[s.index]
                  const d = s.discrimination
                  return (
                    <tr key={s.index}>
                      <td><b>{s.no}</b></td>
                      {info && <td className="area-cell">{r?.area || '-'}</td>}
                      <td>{s.answer}</td>
                      <td className="numc">{s.points ?? '-'}</td>
                      <td><RateBar v={s.rate} /></td>
                      <td className="numc nowrap" title={`상위 ${pc(s.upperRate)} · 하위 ${pc(s.lowerRate)}`}>
                        {d == null ? '-' : d.toFixed(2)}
                        {d != null && d < 0 && <span className="flag bad">음수</span>}
                        {d != null && d >= 0 && d < LOW_DISCRIMINATION && <span className="flag">낮음</span>}
                      </td>
                      <td><ChoiceBar s={s} /></td>
                      <td className="numc muted">
                        {pc(s.noAnswerShare)} · {pc(s.multiShare)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="hint small">
            선택지 분포 막대: 진한 테두리가 정답, 주황이 매력적인 오답(선택 비율 20% 이상이거나 정답보다 많이 고른 오답), 회색이 무응답입니다. 막대에 마우스를 올리면 비율이 보입니다.
            변별도 계산용 상위·하위 집단은 화면과 파일 어디에도 학생별로 표시하지 않습니다.
          </p>
        </section>
      )}

      {sub === 'classes' && (
        <>
          <section className="card">
            <h2>반별 비교</h2>
            <table className="compact">
              <thead>
                <tr>
                  <th>반</th>
                  <th className="numc">응시자</th>
                  <th className="numc">평균</th>
                  <th className="numc">표준편차</th>
                  <th className="numc">최고</th>
                  <th className="numc">최저</th>
                  <th className="numc">중앙값</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.classNo}>
                    <td>{r.classNo}반</td>
                    <td className="numc">{r.summary.count}</td>
                    <td className="numc">{f1(r.summary.mean)}</td>
                    <td className="numc">{f1(r.summary.sd)}</td>
                    <td className="numc">{f1(r.summary.max)}</td>
                    <td className="numc">{f1(r.summary.min)}</td>
                    <td className="numc">{f1(r.summary.median)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>문항별 반 정답률</h2>
            <div className="scroll-x">
              <table className="compact heat-table">
                <thead>
                  <tr>
                    <th>문항</th>
                    <th className="numc">전체</th>
                    {view.classNos.map((c) => (
                      <th key={c} className="numc">{c}반</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.index}>
                      <td><b>{s.no}</b>{info?.rows[s.index]?.area && <span className="muted small"> {info.rows[s.index]!.area}</span>}</td>
                      <td className="numc heat" style={{ background: pastel(s.rate) }}>{pc(s.rate)}</td>
                      {view.classNos.map((c) => (
                        <td key={c} className="numc heat" style={{ background: pastel(s.classRates[c] ?? 0) }}>
                          {pc(s.classRates[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {sub === 'info' && (
        <>
          <InfoEditor work={work} onSaved={onInfoSaved} />
          {info && <InfoGroups work={work} info={info} />}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- 수행평가

function PerformanceAnalysis({ work }: { work: Work }) {
  const { view } = work
  const stats = useMemo(() => areaStats(view.students, view.areas, view.classNos), [view])
  return (
    <>
      <section className="card">
        <h2>영역별 요약</h2>
        <div className="scroll-x">
          <table className="compact">
            <thead>
              <tr>
                <th>영역</th>
                <th className="numc">만점</th>
                <th className="numc">인원</th>
                <th className="numc">평균</th>
                <th className="numc">표준편차</th>
                <th className="numc">최고</th>
                <th className="numc">최저</th>
                <th className="numc">중앙값</th>
                <th className="numc">만점자</th>
                <th className="numc">0점자</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((a) => (
                <tr key={a.area.id} className={a.area.isTotal ? 'total-row' : ''}>
                  <td>{a.area.name}</td>
                  <td className="numc">{a.area.maxScore ?? '-'}</td>
                  <td className="numc">{a.summary.count}</td>
                  <td className="numc">{f1(a.summary.mean)}</td>
                  <td className="numc">{f1(a.summary.sd)}</td>
                  <td className="numc">{f1(a.summary.max)}</td>
                  <td className="numc">{f1(a.summary.min)}</td>
                  <td className="numc">{f1(a.summary.median)}</td>
                  <td className="numc">{a.fullCount}</td>
                  <td className="numc">{a.zeroCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint small">가져온 {view.classNos.length}개 반 기준입니다. 표준편차는 모표준편차입니다.</p>
      </section>

      <section className="card">
        <h2>반별 평균</h2>
        <div className="scroll-x">
          <table className="compact heat-table">
            <thead>
              <tr>
                <th>영역</th>
                {view.classNos.map((c) => (
                  <th key={c} className="numc">{c}반</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((a) => (
                <tr key={a.area.id} className={a.area.isTotal ? 'total-row' : ''}>
                  <td>{a.area.name}</td>
                  {view.classNos.map((c) => {
                    const m = a.classMeans[c] ?? null
                    return (
                      <td key={c} className="numc heat" style={{ background: a.area.maxScore && m != null ? pastel(m / a.area.maxScore) : undefined }}>
                        {f1(m)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>점수 분포</h2>
        <div className="histo-grid">
          {stats.map((a) => (
            <div key={a.area.id}>
              <h3>{a.area.name}</h3>
              <Histogram bins={a.bins} label={a.area.name} />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- screen

export function AnalysisScreen({ work, onInfoSaved }: { work: Work; onInfoSaved: (info: ItemInfo | null) => void }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  async function exportXlsx() {
    setMsg(null)
    setSavedPath(null)
    const r = await window.api.analysisExport(work.workId)
    if (r.canceled) return
    if (!r.ok) return setMsg(r.error ?? '내보내지 못했습니다.')
    setSavedPath(r.path ?? null)
  }

  return (
    <div className="steps analysis">
      <section className="card">
        <div className="row first">
          <div className="grow">
            <h2>문항 분석 <span className="tag soft">교사 전용</span></h2>
            <p className="muted small">{work.workName}</p>
          </div>
          <button className="btn" onClick={exportXlsx}>
            xlsx로 내보내기
          </button>
        </div>
        <p className="hint small">
          학생 화면에서는 이 탭이 보이지 않습니다. 석차·백분위는 계산하지 않습니다. 내보내는 파일에는 학생 이름 없이 집계만 들어가며, 앱 밖에 저장한 파일은 작업을 지워도 남습니다.
        </p>
        {msg && <p className="error-text">{msg}</p>}
        {savedPath && (
          <p className="ok">
            저장했습니다.{' '}
            <button className="linklike" onClick={() => window.api.showInFolder(savedPath)}>
              폴더 열기
            </button>
          </p>
        )}
      </section>
      {work.view.profile === 'regular-exam' ? <ExamAnalysis work={work} onInfoSaved={onInfoSaved} /> : <PerformanceAnalysis work={work} />}
    </div>
  )
}
