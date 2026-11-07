import * as XLSX from 'xlsx'
import type { SheetGrid } from './types'

/** Reads the first sheet of an .xlsx/.xls file into a plain 2D array of raw cell values. */
export function readGrid(data: ArrayBuffer | Uint8Array): SheetGrid {
  const wb = XLSX.read(data, { type: 'array', cellDates: false })
  const first = wb.SheetNames[0]
  if (!first) return []
  const ws = wb.Sheets[first]!
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true }) as SheetGrid
}
