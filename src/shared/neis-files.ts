// Which NEIS files to download and where. One source for the 「파일 넣기」 card, the 사용 설명 page and README.

export interface NeisFile {
  need: '필수' | '선택'
  name: string
  /** NEIS menu path, ending at the report screen. The teacher then presses 저장 and picks `format`. */
  menu: string[]
  format: 'XLS Data' | 'PDF'
  note: string
}

export interface NeisFileGroup {
  title: string
  files: NeisFile[]
}

const EXAM = ['성적', '지필평가조회/통계', '지필평가조회']
const PERFORMANCE = ['성적', '수행평가조회/통계', '수행평가조회']

export const NEIS_FILE_GROUPS: NeisFileGroup[] = [
  {
    title: '정기고사',
    files: [
      {
        need: '필수',
        name: '교과목별 학생답 정오표',
        menu: [...EXAM, '교과목별학생답정오표'],
        format: 'XLS Data',
        note: '반마다 한 파일씩 받습니다.'
      },
      {
        need: '필수',
        name: '교과목별 일람표(강의실별)',
        menu: [...EXAM, '교과목별일람표조회-강의실별'],
        format: 'PDF',
        note: '반마다 한 파일. 서명을 넣을 원본이라 없는 반은 서명을 받을 수 없습니다.'
      },
      {
        need: '선택',
        name: '교과목별 일람표(전체학급)',
        menu: [...EXAM, '교과목별일람표조회-전체학급'],
        format: 'XLS Data',
        note: '넣으면 학년 평균을 학년 전체로 계산합니다. 없으면 넣은 반들로 계산합니다.'
      }
    ]
  },
  {
    title: '수행평가',
    files: [
      {
        need: '필수',
        name: '학급별 일람표(강의실별)',
        menu: [...PERFORMANCE, '학급일람표조회-전체영역'],
        format: 'PDF',
        note: '반마다 한 파일. 서명을 넣을 원본이라 없는 반은 서명을 받을 수 없습니다.'
      },
      {
        need: '필수',
        name: '학급별 일람표(강의실별)',
        menu: [...PERFORMANCE, '학급일람표조회-전체영역'],
        format: 'XLS Data',
        note: '같은 화면에서 엑셀로도 저장합니다. 반마다 한 파일.'
      }
    ]
  }
]

/** 성적 → 지필평가조회/통계 → … → 저장 */
export const menuText = (f: NeisFile) => [...f.menu, '저장'].join(' → ')

/** One line per file for plain-text places (사용 설명, README). */
export const neisFileLine = (group: string, f: NeisFile) =>
  `${group} [${f.need}] ${f.name}: 나이스 ${menuText(f)} (${f.format}). ${f.note}`
