import type { Floor, Point, Wall } from '../types'
import { add, dist, left, lineIntersect, mul, norm, sub } from './math'

export type WallSolid = { wallId: string; points: Point[] }
export type WallWindow = { wallId: string; openingId: string; points: Point[]; a: Point; b: Point }
export type WallDash = { wallId: string; a: Point; b: Point }

export type WallGraphics = {
  solids: WallSolid[]
  windows: WallWindow[]
  dashes: WallDash[]
}

type EndCap = { right: Point; left: Point }

function vertexOf(floor: Floor, id: string) {
  return floor.vertices.find((vertex) => vertex.id === id)
}

export function wallEnds(floor: Floor, wall: Wall): { a: Point; b: Point } | null {
  const a = vertexOf(floor, wall.a)
  const b = vertexOf(floor, wall.b)
  if (!a || !b) return null
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }
}

export function wallLengthOf(floor: Floor, wall: Wall): number {
  const ends = wallEnds(floor, wall)
  return ends ? dist(ends.a, ends.b) : 0
}

function incident(floor: Floor, vertexId: string): { wall: Wall; other: Point; otherId: string }[] {
  const out: { wall: Wall; other: Point; otherId: string }[] = []
  for (const wall of floor.walls) {
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    if (wall.a === vertexId) out.push({ wall, other: ends.b, otherId: wall.b })
    else if (wall.b === vertexId) out.push({ wall, other: ends.a, otherId: wall.a })
  }
  return out
}

function capAt(floor: Floor, wall: Wall, vertexId: string, other: Point): EndCap {
  const vertex = vertexOf(floor, vertexId)
  const h = wall.thickness / 2
  const fallback = vertex ? { x: vertex.x, y: vertex.y } : other
  if (!vertex || h <= 0) return { right: fallback, left: fallback }
  const v = { x: vertex.x, y: vertex.y }
  const d = norm(sub(other, v))
  const n = left(d)
  const leftP = add(v, mul(n, h))
  const rightP = add(v, mul(n, -h))
  const neighbors = incident(floor, vertexId).filter((item) => item.wall.id !== wall.id && item.wall.thickness > 0)
  if (neighbors.length === 0 || lenSafe(d) === 0) return { right: rightP, left: leftP }
  const angle = Math.atan2(d.y, d.x)
  const ranked = neighbors
    .map((item) => {
      const dir = norm(sub(item.other, v))
      let delta = Math.atan2(dir.y, dir.x) - angle
      while (delta <= 0) delta += Math.PI * 2
      while (delta > Math.PI * 2) delta -= Math.PI * 2
      return { ...item, dir, delta }
    })
    .sort((p, q) => p.delta - q.delta)
  const ccw = ranked[0]
  const cw = ranked[ranked.length - 1]
  return {
    left: miter(v, leftP, d, h, ccw.dir, ccw.wall.thickness / 2, true),
    right: miter(v, rightP, d, h, cw.dir, cw.wall.thickness / 2, false),
  }
}

function lenSafe(v: Point): number {
  return Math.hypot(v.x, v.y)
}

function miter(
  vertex: Point,
  butt: Point,
  dir: Point,
  h: number,
  neighborDir: Point,
  neighborH: number,
  leftSide: boolean,
): Point {
  const neighborSide = leftSide
    ? add(vertex, mul(left(neighborDir), -neighborH))
    : add(vertex, mul(left(neighborDir), neighborH))
  const hit = lineIntersect(butt, add(butt, dir), neighborSide, add(neighborSide, neighborDir))
  if (!hit) return butt
  const limit = Math.max(h, neighborH, 0.5) * 4
  if (dist(hit, vertex) > limit) return add(vertex, mul(norm(sub(hit, vertex)), limit))
  return hit
}

function quad(
  a: Point,
  b: Point,
  thickness: number,
  s0: number,
  s1: number,
  start: EndCap | null,
  end: EndCap | null,
): Point[] {
  const d = norm(sub(b, a))
  const n = left(d)
  const h = thickness / 2
  const p0 = add(a, mul(d, s0))
  const p1 = add(a, mul(d, s1))
  const r0 = start ? start.right : add(p0, mul(n, -h))
  const l0 = start ? start.left : add(p0, mul(n, h))
  const r1 = end ? end.right : add(p1, mul(n, -h))
  const l1 = end ? end.left : add(p1, mul(n, h))
  return [r0, r1, l1, l0]
}

export function wallGraphics(floor: Floor, includeDashed: boolean): WallGraphics {
  const solids: WallSolid[] = []
  const windows: WallWindow[] = []
  const dashes: WallDash[] = []

  for (const wall of floor.walls) {
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    const length = dist(ends.a, ends.b)
    if (length < 1e-6) continue
    if (wall.thickness <= 0) {
      if (includeDashed) dashes.push({ wallId: wall.id, a: ends.a, b: ends.b })
      continue
    }
    const openings = floor.openings
      .filter((opening) => opening.wallId === wall.id)
      .slice()
      .sort((p, q) => p.offset - q.offset)
    const gaps: { s: number; e: number; windowId?: string }[] = []
    let cursor = 0
    for (const opening of openings) {
      const start = Math.max(0, Math.min(length, opening.offset))
      const end = Math.max(start, Math.min(length, opening.offset + opening.width))
      if (start > cursor + 1e-4) gaps.push({ s: cursor, e: start })
      if (opening.kind === 'window' && end - start > 1e-4) {
        gaps.push({ s: start, e: end, windowId: opening.id })
      }
      cursor = Math.max(cursor, end)
    }
    if (length > cursor + 1e-4) gaps.push({ s: cursor, e: length })

    const startCap = capAt(floor, wall, wall.a, ends.b)
    // The end cap is measured back along the wall, so its left and right are swapped
    // relative to the direction from a to b.
    const endRaw = capAt(floor, wall, wall.b, ends.a)
    const endCap = { right: endRaw.left, left: endRaw.right }
    for (const gap of gaps) {
      const useStart = gap.s <= 1e-4
      const useEnd = gap.e >= length - 1e-4
      const points = quad(
        ends.a,
        ends.b,
        wall.thickness,
        gap.s,
        gap.e,
        useStart ? startCap : null,
        useEnd ? endCap : null,
      )
      if (gap.windowId) {
        const d = norm(sub(ends.b, ends.a))
        windows.push({
          wallId: wall.id,
          openingId: gap.windowId,
          points,
          a: add(ends.a, mul(d, gap.s)),
          b: add(ends.a, mul(d, gap.e)),
        })
      } else solids.push({ wallId: wall.id, points })
    }
  }
  return { solids, windows, dashes }
}

export function alongWall(a: Point, b: Point, distance: number): Point {
  const d = norm(sub(b, a))
  return add(a, mul(d, distance))
}
