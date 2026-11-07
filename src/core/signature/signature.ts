// Signature data shared by PC direct signing and phone signing. Points are normalised to 0..1
// of the drawing canvas: [x, y, tMillis]. Stored as vectors so they can be fitted into any PDF cell.

export type Stroke = [number, number, number][]

export interface SignaturePayload {
  requestId: string
  canvas: { w: number; h: number }
  strokes: Stroke[]
}

const MAX_STROKES = 400
const MAX_POINTS = 20000

export function isValidSignature(p: unknown): p is SignaturePayload {
  if (!p || typeof p !== 'object') return false
  const s = p as SignaturePayload
  if (typeof s.requestId !== 'string' || !/^[0-9a-f]{32}$/.test(s.requestId)) return false
  if (!s.canvas || !(s.canvas.w > 0) || !(s.canvas.h > 0)) return false
  if (!Array.isArray(s.strokes) || s.strokes.length === 0 || s.strokes.length > MAX_STROKES) return false
  let points = 0
  for (const st of s.strokes) {
    if (!Array.isArray(st) || st.length === 0) return false
    for (const pt of st) {
      if (!Array.isArray(pt) || pt.length !== 3 || !pt.every(Number.isFinite)) return false
      if (pt[0] < -0.05 || pt[0] > 1.05 || pt[1] < -0.05 || pt[1] > 1.05) return false
      points++
    }
  }
  return points <= MAX_POINTS
}

/** A signature with almost no ink (a dot or an accidental tap) is rejected before saving. */
export function hasEnoughInk(strokes: Stroke[]): boolean {
  let length = 0
  for (const st of strokes)
    for (let i = 1; i < st.length; i++) length += Math.hypot(st[i]![0] - st[i - 1]![0], st[i]![1] - st[i - 1]![1])
  return length > 0.15
}

/** Phone/PC canvas shape follows the PDF cell, clamped to something a hand can sign in. */
export function canvasAspect(cellAspect: number | null, profile: 'regular-exam' | 'performance'): number {
  const a = cellAspect ?? (profile === 'regular-exam' ? 10 : 3)
  return Math.min(4, Math.max(2.5, a))
}
