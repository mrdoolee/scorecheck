import { findCell, headText, str } from './grid'
import type { FileKind, SheetGrid } from './types'

/**
 * Decides the file kind from the title keywords and table structure.
 * Returns null for anything that is not a confirmed, supported NEIS form.
 */
export function detectKind(grid: SheetGrid): FileKind | null {
  const head = headText(grid, 15).replace(/\s+/g, '')

  if (head.includes('학생답정오표')) {
    const header = findCell(grid, (s) => s === '반/번호')
    const below = header && grid[header.row + 1]
    if (below && below.some((c) => str(c) === '정답')) return 'answer-sheet'
    return null
  }

  if (head.includes('수행평가') && head.includes('일람표')) {
    const header = findCell(grid, (s) => s === '반/번호')
    if (header && (grid[header.row] ?? []).some((c) => str(c) === '합계')) return 'performance-class'
    return null
  }

  if (head.includes('정기시험') && head.includes('교과목별일람표')) {
    if (findCell(grid, (s) => s.replace(/\s/g, '') === '반번호')) return 'grade-summary'
    return null
  }

  return null
}
