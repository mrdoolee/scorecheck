// Red (low) → soft lavender (middle) → blue (high) color scale for correct rates and scores.
type RGB = [number, number, number]

const PASTEL: RGB[] = [
  [244, 166, 166],
  [236, 224, 242],
  [166, 200, 244]
]
const DEEP: RGB[] = [
  [226, 92, 92],
  [176, 132, 200],
  [74, 134, 224]
]

function hex([r, g, b]: RGB) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function at(stops: RGB[], t: number): string {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i]!
  const b = stops[i + 1]!
  return hex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f])
}

/** Pastel color for a 0–1 value: tiles and average bars. */
export const pastel = (t: number) => at(PASTEL, t)
/** Stronger color for a 0–1 value: the student's own bar. */
export const deep = (t: number) => at(DEEP, t)

export const pastelGradient = `linear-gradient(90deg, ${PASTEL.map(hex).join(', ')})`
