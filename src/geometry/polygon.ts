import {
  add,
  cross,
  dist,
  left,
  lineIntersect,
  mul,
  norm,
  pointInTriangle,
  polygonArea,
  selfIntersects,
  signedArea,
  sub,
} from './math'
import type { Point } from '../types'

function dedupe(poly: Point[]): Point[] {
  if (poly.length < 3) return poly.slice()
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i]
    const next = poly[(i + 1) % poly.length]
    const prev = poly[(i - 1 + poly.length) % poly.length]
    if (dist(curr, next) < 1e-6) continue
    const turn = cross(sub(curr, prev), sub(next, curr))
    const forward = sub(curr, prev).x * sub(next, curr).x + sub(curr, prev).y * sub(next, curr).y
    if (Math.abs(turn) < 1e-8 && forward > 0) continue
    out.push(curr)
  }
  return out.length >= 3 ? out : poly.slice()
}

function earClip(poly: Point[]): Point[][] {
  const src = dedupe(signedArea(poly) < 0 ? [...poly].reverse() : poly)
  const pts = src.map((p) => ({ x: p.x, y: p.y }))
  const tris: Point[][] = []
  if (pts.length < 3) return tris
  if (pts.length === 3) return [pts]
  let guard = pts.length * pts.length
  while (pts.length > 3 && guard-- > 0) {
    let clipped = false
    for (let i = 0; i < pts.length; i++) {
      const i0 = (i + pts.length - 1) % pts.length
      const i1 = i
      const i2 = (i + 1) % pts.length
      if (cross(sub(pts[i1], pts[i0]), sub(pts[i2], pts[i1])) <= 1e-10) continue
      let contains = false
      for (let j = 0; j < pts.length; j++) {
        if (j === i0 || j === i1 || j === i2) continue
        if (pointInTriangle(pts[j], pts[i0], pts[i1], pts[i2])) {
          contains = true
          break
        }
      }
      if (contains) continue
      tris.push([pts[i0], pts[i1], pts[i2]])
      pts.splice(i1, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (pts.length === 3) tris.push([pts[0], pts[1], pts[2]])
  return tris
}

function insideEdge(p: Point, a: Point, b: Point): boolean {
  return cross(sub(b, a), sub(p, a)) >= -1e-7
}

function clipConvex(subject: Point[], clip: Point[]): Point[] {
  let output = subject.slice()
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      const pin = insideEdge(p, a, b)
      const qin = insideEdge(q, a, b)
      if (pin && qin) output.push(q)
      else if (pin && !qin) {
        const hit = lineIntersect(p, q, a, b)
        if (hit) output.push(hit)
      } else if (!pin && qin) {
        const hit = lineIntersect(p, q, a, b)
        if (hit) output.push(hit)
        output.push(q)
      }
    }
  }
  return output
}

export function polygonIntersectArea(a: Point[], b: Point[]): number {
  if (a.length < 3 || b.length < 3) return 0
  const ta = earClip(a)
  const tb = earClip(b)
  if (ta.length === 0 || tb.length === 0) return 0
  let area = 0
  for (const t1 of ta) {
    for (const t2 of tb) {
      const clipped = clipConvex(t1, t2)
      if (clipped.length >= 3) area += polygonArea(clipped)
    }
  }
  return area
}

export type Region = { outer: Point[]; holes: Point[][] }

export function regionIntersectArea(a: Region, b: Region): number {
  let area = polygonIntersectArea(a.outer, b.outer)
  for (const hole of b.holes) area -= polygonIntersectArea(a.outer, hole)
  for (const hole of a.holes) area -= polygonIntersectArea(hole, b.outer)
  for (const ha of a.holes) {
    for (const hb of b.holes) area += polygonIntersectArea(ha, hb)
  }
  return Math.max(0, area)
}

export function sharedBoundary(a: Point[], b: Point[]): number {
  let total = 0
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]
    const a1 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j]
      const b1 = b[(j + 1) % b.length]
      const r = sub(a1, a0)
      const l2 = r.x * r.x + r.y * r.y
      if (l2 < 1e-12) continue
      const l = Math.sqrt(l2)
      if (Math.abs(cross(sub(b0, a0), r)) > 1e-4 * l) continue
      if (Math.abs(cross(sub(b1, a0), r)) > 1e-4 * l) continue
      const t0 = (sub(b0, a0).x * r.x + sub(b0, a0).y * r.y) / l2
      const t1 = (sub(b1, a0).x * r.x + sub(b1, a0).y * r.y) / l2
      const lo = Math.max(0, Math.min(t0, t1))
      const hi = Math.min(1, Math.max(t0, t1))
      if (hi > lo) total += (hi - lo) * l
    }
  }
  return total
}

/** CCW ring. inward offsets each edge to its left by halfWidths[i]. */
export function offsetRing(ring: Point[], halfWidths: number[], inward: boolean): Point[] {
  const n = ring.length
  if (n < 3) return ring.slice()
  const sign = inward ? 1 : -1
  const lines = ring.map((a, i) => {
    const b = ring[(i + 1) % n]
    const d = norm(sub(b, a))
    const h = halfWidths[i] ?? 0
    return { p: add(a, mul(left(d), sign * h)), d, h }
  })
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const prev = lines[(i + n - 1) % n]
    const cur = lines[i]
    const vertex = ring[i]
    const hit = lineIntersect(prev.p, add(prev.p, prev.d), cur.p, add(cur.p, cur.d))
    const limit = Math.max(prev.h, cur.h, 0.5) * 4
    if (!hit) {
      const push = mul(norm(add(left(prev.d), left(cur.d))), sign * Math.max(prev.h, cur.h))
      out.push(add(vertex, push))
    } else if (dist(hit, vertex) > limit) {
      out.push(add(vertex, mul(norm(sub(hit, vertex)), limit)))
    } else out.push(hit)
  }
  return out
}

export function safeOffset(ring: Point[], halfWidths: number[], inward: boolean): Point[] {
  for (const scale of [1, 0.5, 0]) {
    const widths = halfWidths.map((w) => w * scale)
    const pts = offsetRing(ring, widths, inward)
    if (pts.length >= 3 && Math.abs(signedArea(pts)) > 1e-4 && !selfIntersects(pts)) {
      if (inward && signedArea(ring) > 0 && signedArea(pts) < 0) continue
      return pts
    }
  }
  return ring.slice()
}
