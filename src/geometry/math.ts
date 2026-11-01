import type { Point } from '../types'

export const EPS = 1e-6

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function mul(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s }
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function len(a: Point): number {
  return Math.hypot(a.x, a.y)
}

export function norm(a: Point): Point {
  const l = len(a)
  if (l < 1e-12) return { x: 0, y: 0 }
  return { x: a.x / l, y: a.y / l }
}

export function left(a: Point): Point {
  return { x: -a.y, y: a.x }
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function samePoint(a: Point, b: Point, eps = 1e-4): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

export function signedArea(poly: Point[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function polygonArea(poly: Point[]): number {
  return Math.abs(signedArea(poly))
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersect =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || EPS) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

export function pointInRegion(p: Point, outer: Point[], holes: Point[][]): boolean {
  if (!pointInPolygon(p, outer)) return false
  for (const hole of holes) {
    if (pointInPolygon(p, hole)) return false
  }
  return true
}

export function projectSegment(
  p: Point,
  a: Point,
  b: Point,
): { t: number; point: Point; distance: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-18) return { t: 0, point: a, distance: dist(p, a) }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  const point = lerp(a, b, t)
  return { t, point, distance: dist(p, point) }
}

export function projectLine(
  p: Point,
  a: Point,
  b: Point,
): { t: number; point: Point; distance: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-18) return { t: 0, point: a, distance: dist(p, a) }
  const t = dot(sub(p, a), ab) / l2
  const point = lerp(a, b, t)
  return { t, point, distance: dist(p, point) }
}

export function lineIntersect(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1 = sub(p2, p1)
  const d2 = sub(p4, p3)
  const den = cross(d1, d2)
  if (Math.abs(den) < 1e-12) return null
  const t = cross(sub(p3, p1), d2) / den
  return add(p1, mul(d1, t))
}

/** Parameter of the intersection along AB, if the segments meet including endpoints. */
export function segmentParams(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): { t: number; u: number; point: Point } | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = cross(r, s)
  if (Math.abs(den) < 1e-10) return null
  const t = cross(sub(c, a), s) / den
  const u = cross(sub(c, a), r) / den
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null
  const ct = Math.max(0, Math.min(1, t))
  return { t: ct, u: Math.max(0, Math.min(1, u)), point: lerp(a, b, ct) }
}

export function overlapLength(a: Point, b: Point, c: Point, d: Point): number {
  const r = sub(b, a)
  const l2 = dot(r, r)
  if (l2 < 1e-18) return 0
  const l = Math.sqrt(l2)
  if (Math.abs(cross(sub(c, a), r)) > 1e-5 * l) return 0
  if (Math.abs(cross(sub(d, a), r)) > 1e-5 * l) return 0
  const t0 = dot(sub(c, a), r) / l2
  const t1 = dot(sub(d, a), r) / l2
  const lo = Math.max(0, Math.min(t0, t1))
  const hi = Math.min(1, Math.max(t0, t1))
  return Math.max(0, hi - lo) * l
}

export function pointInSegmentInterior(p: Point, a: Point, b: Point, eps = 1e-4): boolean {
  const proj = projectSegment(p, a, b)
  return proj.distance <= eps && proj.t > 0.002 && proj.t < 0.998
}

export function segmentsCollide(a: Point, b: Point, c: Point, d: Point): boolean {
  if (overlapLength(a, b, c, d) > 1e-3) return true
  const hit = segmentParams(a, b, c, d)
  if (hit && hit.t > 0.002 && hit.t < 0.998 && hit.u > 0.002 && hit.u < 0.998) return true
  if (pointInSegmentInterior(a, c, d) || pointInSegmentInterior(b, c, d)) return true
  if (pointInSegmentInterior(c, a, b) || pointInSegmentInterior(d, a, b)) return true
  return false
}

export function constrainAngle(origin: Point, target: Point): Point {
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const l = Math.hypot(dx, dy)
  if (l < 1e-9) return { x: origin.x, y: origin.y }
  const step = Math.PI / 4
  const ang = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: origin.x + Math.cos(ang) * l, y: origin.y + Math.sin(ang) * l }
}

export function distToRay(p: Point, origin: Point, angle: number): number {
  const d = { x: Math.cos(angle), y: Math.sin(angle) }
  return Math.abs(cross(d, sub(p, origin)))
}

export function angleOf(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

export function interiorPoint(poly: Point[]): Point {
  if (poly.length === 0) return { x: 0, y: 0 }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const mid = lerp(a, b, 0.5)
    const n = left(norm(sub(b, a)))
    for (const step of [1e-3, 0.05, 0.5, 2]) {
      const p = add(mid, mul(n, step))
      if (pointInPolygon(p, poly)) return p
    }
  }
  return {
    x: (poly[0].x + poly[Math.min(1, poly.length - 1)].x) / 2,
    y: (poly[0].y + poly[Math.min(1, poly.length - 1)].y) / 2,
  }
}

export function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const c1 = cross(sub(b, a), sub(p, a))
  const c2 = cross(sub(c, b), sub(p, b))
  const c3 = cross(sub(a, c), sub(p, c))
  const neg = c1 < -1e-8 || c2 < -1e-8 || c3 < -1e-8
  const pos = c1 > 1e-8 || c2 > 1e-8 || c3 > 1e-8
  return !(neg && pos)
}

export function selfIntersects(poly: Point[]): boolean {
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue
      const c = poly[j]
      const d = poly[(j + 1) % n]
      const hit = segmentParams(a, b, c, d)
      if (hit && hit.t > 0.01 && hit.t < 0.99 && hit.u > 0.01 && hit.u < 0.99) return true
    }
  }
  return false
}
