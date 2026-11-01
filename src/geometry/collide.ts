import { MIN_SPAN } from '../constants'
import type { Floor, Point } from '../types'
import { analyze } from './faces'
import { segmentsCollide, selfIntersects, signedArea } from './math'
import { wallEnds, wallLengthOf } from './walls'

export function wallsCollide(floor: Floor, movedWallIds: Set<string>): boolean {
  const byId = new Map(floor.walls.map((wall) => [wall.id, wall]))
  const moved = [...movedWallIds]
  for (let i = 0; i < moved.length; i++) {
    const wall = byId.get(moved[i])
    if (!wall) continue
    const ends = wallEnds(floor, wall)
    if (!ends) return true
    if (wallLengthOf(floor, wall) < MIN_SPAN) return true
    for (const other of floor.walls) {
      if (other.id === wall.id) continue
      if (movedWallIds.has(other.id) && other.id < wall.id) continue
      const otherEnds = wallEnds(floor, other)
      if (!otherEnds) continue
      if (segmentsCollide(ends.a, ends.b, otherEnds.a, otherEnds.b)) return true
    }
  }
  return false
}

export function segmentRejected(floor: Floor, a: Point, b: Point): boolean {
  if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_SPAN) return true
  for (const wall of floor.walls) {
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    if (segmentsCollide(a, b, ends.a, ends.b)) {
      const touchesEnd =
        near(a, ends.a) || near(a, ends.b) || near(b, ends.a) || near(b, ends.b)
      const startsOnWall = pointNearSegment(a, ends.a, ends.b) || pointNearSegment(b, ends.a, ends.b)
      if (touchesEnd && !overlapInterior(a, b, ends.a, ends.b)) continue
      if (startsOnWall && !overlapInterior(a, b, ends.a, ends.b) && !strictCross(a, b, ends.a, ends.b)) {
        continue
      }
      return true
    }
  }
  return false
}

function near(a: Point, b: Point): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-3
}

function pointNearSegment(p: Point, a: Point, b: Point): boolean {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const l2 = abx * abx + aby * aby
  if (l2 < 1e-12) return near(p, a)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2
  t = Math.max(0, Math.min(1, t))
  const x = a.x + abx * t
  const y = a.y + aby * t
  return Math.hypot(p.x - x, p.y - y) < 1e-3
}

function overlapInterior(a: Point, b: Point, c: Point, d: Point): boolean {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const l2 = r.x * r.x + r.y * r.y
  if (l2 < 1e-12) return false
  const l = Math.sqrt(l2)
  const cross = (p: Point) => Math.abs((p.x - a.x) * r.y - (p.y - a.y) * r.x)
  if (cross(c) > 1e-4 * l || cross(d) > 1e-4 * l) return false
  const t = (p: Point) => ((p.x - a.x) * r.x + (p.y - a.y) * r.y) / l2
  const lo = Math.max(0, Math.min(t(c), t(d)))
  const hi = Math.min(1, Math.max(t(c), t(d)))
  return hi - lo > 1e-3
}

function strictCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const s = { x: d.x - c.x, y: d.y - c.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-10) return false
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99
}

export function movedWallIds(floor: Floor, vertexIds: Set<string>): Set<string> {
  const ids = new Set<string>()
  for (const wall of floor.walls) {
    if (vertexIds.has(wall.a) || vertexIds.has(wall.b)) ids.add(wall.id)
  }
  return ids
}

export function layoutOk(origin: Floor, next: Floor, moved: Set<string>): boolean {
  if (moved.size > 0 && wallsCollide(next, moved)) return false
  const before = analyze(origin).faces.map((face) => face.vertexIds.join('\0')).sort()
  const after = analyze(next)
  const keys = after.faces.map((face) => face.vertexIds.join('\0')).sort()
  if (before.length !== keys.length || before.some((key, index) => key !== keys[index])) return false
  return after.faces.every((face) => signedArea(face.outer) > 1e-6 && !selfIntersects(face.outer))
}
