// Rows for the item-analysis xlsx export. Aggregates only: no student names, numbers, or per-student rows.
import type { Area, ExamMeta, Item, ProfileId, StudentRecord } from '../import/types'
import { round } from '../stats/stats'
import { areaStats, classRows, examTakers, fullSummary, infoGroupStats, itemStats } from './analysis'
import { FIELD_LABEL, hasAnyInfo, type InfoField, type ItemInfo } from './info'

export type Row = (string | number | null)[]
export interface SheetData {
  name: string
  rows: Row[]
}

export interface ExportInput {
  profile: ProfileId
  meta: ExamMeta
  areas: Area[]
  items: Item[]
  classNos: number[]
  students: StudentRecord[]
}

const r1 = (v: number | null | undefined) => (v == null ? null : round(v, 1))
const pct = (v: number | null | undefined) => (v == null ? null : round(v * 100, 1))

function title(m: ExamMeta): string {
  return [m.schoolYear && `${m.schoolYear}학년도`, m.semester && `${m.semester}학기`, m.grade && `${m.grade}학년`, m.examName, m.subject]
    .filter(Boolean)
    .join(' ')
}

export function exportSheets(v: ExportInput, info: ItemInfo | null): SheetData[] {
  return v.profile === 'regular-exam' ? examSheets(v, info) : performanceSheets(v)
}

function examSheets(v: ExportInput, info: ItemInfo | null): SheetData[] {
  const takers = examTakers(v.students)
  const total = fullSummary(takers.map((s) => s.scores['total'] as number))
  const stats = itemStats(v.students, v.items, v.classNos)
  const withInfo = hasAnyInfo(info) ? info : null

  const summary: SheetData = {
    name: '시험 요약',
    rows: [
      [title(v.meta)],
      ['가져온 반', v.classNos.map((c) => `${c}반`).join(', ')],
      [],
      ['구분', '응시자 수', '평균', '표준편차', '최고', '최저', '중앙값'],
      ['전체', total.count, r1(total.mean), r1(total.sd), total.max, total.min, r1(total.median)],
      ...classRows(takers, v.classNos, 'total').map((c) => [`${c.classNo}반`, c.summary.count, r1(c.summary.mean), r1(c.summary.sd), c.summary.max, c.summary.min, r1(c.summary.median)]),
      [],
      ['표준편차는 모표준편차입니다. 석차·백분위는 계산하지 않습니다.']
    ]
  }

  const itemHead = ['문항', '정답', '배점', ...(withInfo ? ['내용영역', '성취기준'] : []), '정답률(%)', '변별도', '상위 27% 정답률(%)', '하위 27% 정답률(%)', '무응답(%)', '복수 표기(%)', '매력적인 오답']
  const items: SheetData = {
    name: '문항별',
    rows: [
      itemHead,
      ...stats.map((s) => {
        const r = withInfo?.rows[s.index]
        return [
          s.no,
          s.answer,
          s.points,
          ...(withInfo ? [r?.area ?? '', r?.standard ?? ''] : []),
          pct(s.rate),
          s.discrimination == null ? null : round(s.discrimination, 2),
          pct(s.upperRate),
          pct(s.lowerRate),
          pct(s.noAnswerShare),
          pct(s.multiShare),
          s.choices.filter((c) => c.attractive).map((c) => c.label).join(', ')
        ]
      })
    ]
  }

  const optionKeys = stats[0]?.choices.map((c) => c.label) ?? []
  const choices: SheetData = {
    name: '선택지 분포',
    rows: [
      ['문항', '정답', ...optionKeys.map((k) => `${k}(%)`)],
      ...stats.map((s) => [s.no, s.answer, ...optionKeys.map((k) => pct(s.choices.find((c) => c.label === k)?.share ?? 0))])
    ]
  }

  const classes: SheetData = {
    name: '반별 정답률',
    rows: [['문항', '전체(%)', ...v.classNos.map((c) => `${c}반(%)`)], ...stats.map((s) => [s.no, pct(s.rate), ...v.classNos.map((c) => pct(s.classRates[c]))])]
  }

  const sheets = [summary, items, choices, classes]
  if (withInfo) {
    const rows: Row[] = []
    for (const field of ['area', 'standard'] as InfoField[]) {
      const groups = infoGroupStats(v.students, v.items, v.classNos, withInfo, field)
      if (!groups.length) continue
      if (rows.length) rows.push([])
      rows.push([FIELD_LABEL[field], '문항', '배점 합', '득점률(%)', ...v.classNos.map((c) => `${c}반(%)`)])
      for (const g of groups) rows.push([g.label, g.items.map((i) => v.items[i]?.no ?? i + 1).join(', '), round(g.points, 1), pct(g.scoreRate), ...v.classNos.map((c) => pct(g.classRates[c]))])
    }
    sheets.push({ name: '문항정보별', rows })
  }
  return sheets
}

function performanceSheets(v: ExportInput): SheetData[] {
  const stats = areaStats(v.students, v.areas, v.classNos)
  return [
    {
      name: '영역별 요약',
      rows: [
        [title(v.meta)],
        [],
        ['영역', '만점', '인원', '평균', '표준편차', '최고', '최저', '중앙값', '만점자 수', '0점자 수'],
        ...stats.map((a) => [a.area.name, a.area.maxScore, a.summary.count, r1(a.summary.mean), r1(a.summary.sd), a.summary.max, a.summary.min, r1(a.summary.median), a.fullCount, a.zeroCount]),
        [],
        ['표준편차는 모표준편차입니다. 석차·백분위는 계산하지 않습니다.']
      ]
    },
    {
      name: '반별 평균',
      rows: [['영역', ...v.classNos.map((c) => `${c}반`)], ...stats.map((a) => [a.area.name, ...v.classNos.map((c) => r1(a.classMeans[c]))])]
    },
    {
      name: '점수 분포',
      rows: stats.flatMap((a, i) => [
        ...(i ? [[] as Row] : []),
        [a.area.name, '구간', '인원'],
        ...a.bins.map((b) => ['', `${r1(b.from)} ~ ${r1(b.to)}`, b.count])
      ])
    }
  ]
}
