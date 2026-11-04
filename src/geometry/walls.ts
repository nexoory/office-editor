import { analyze } from './faces'
import type { Floor, OpeningKind, Point, Wall } from '../types'
import { add, cross, dist, left, lineIntersect, mul, norm, sub } from './math'

/** Смещения от оси: влево и вправо по ходу от a к b. Без пары полей — поровну. */
export function wallBias(wall: Pick<Wall, 'thickness' | 'left' | 'right'>): { left: number; right: number } {
  if (typeof wall.left === 'number' && typeof wall.right === 'number') {
    return { left: Math.max(0, wall.left), right: Math.max(0, wall.right) }
  }
  const half = Math.max(0, wall.thickness) / 2
  return { left: half, right: half }
}

export function wallSplit(wall: Pick<Wall, 'left' | 'right'>): boolean {
  return typeof wall.left === 'number' && typeof wall.right === 'number'
}

/** Куда от оси смотрит помещение. Если их два, внутрь — в меньшее. Без помещения внутрь слева по ходу стены. */
export function innerIsLeft(floor: Floor, wall: Wall): boolean {
  let best: { left: boolean; area: number } | null = null
  for (const face of analyze(floor).faces) {
    const ids = face.vertexIds
    for (let index = 0; index < ids.length; index++) {
      const from = ids[index]
      const to = ids[(index + 1) % ids.length]
      const leftSide = from === wall.a && to === wall.b
      const rightSide = from === wall.b && to === wall.a
      if (!leftSide && !rightSide) continue
      if (!best || face.area < best.area) best = { left: leftSide, area: face.area }
    }
  }
  return best?.left ?? true
}

/** Насколько точка отстоит от оси и какой предел толщины с её стороны. */
export function wallReach(wall: Wall, a: Point, b: Point, point: Point): number {
  const bias = wallBias(wall)
  const side = cross(sub(b, a), sub(point, a))
  return side >= 0 ? bias.left : bias.right
}

export type WallSolid = { wallId: string; points: Point[] }
export type WallCut = { wallId: string; openingId: string; kind: OpeningKind; points: Point[]; a: Point; b: Point }
export type WallDash = { wallId: string; a: Point; b: Point }

export type WallGraphics = {
  solids: WallSolid[]
  cuts: WallCut[]
  dashes: WallDash[]
  /** Заливка дыры в вершине, куда сходятся три стены и больше. */
  joins: Point[][]
}

type EndCap = { right: Point; left: Point }

const vertexIndexCache = new WeakMap<Floor, Map<string, Point>>()

function vertexIndex(floor: Floor): Map<string, Point> {
  const cached = vertexIndexCache.get(floor)
  if (cached) return cached
  const index = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]))
  vertexIndexCache.set(floor, index)
  return index
}

function vertexOf(floor: Floor, id: string) {
  return vertexIndex(floor).get(id)
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

type Incident = { wall: Wall; other: Point; otherId: string }

function incidentIndex(floor: Floor): Map<string, Incident[]> {
  const pos = vertexIndex(floor)
  const map = new Map<string, Incident[]>()
  for (const vertex of floor.vertices) map.set(vertex.id, [])
  for (const wall of floor.walls) {
    const a = pos.get(wall.a)
    const b = pos.get(wall.b)
    if (!a || !b) continue
    map.get(wall.a)?.push({ wall, other: { x: b.x, y: b.y }, otherId: wall.b })
    map.get(wall.b)?.push({ wall, other: { x: a.x, y: a.y }, otherId: wall.a })
  }
  return map
}

/** Смещение в системе «от этой вершины к другому концу»: локальный левый и правый. */
function outward(wall: Wall, vertexId: string, localLeft: boolean): number {
  const bias = wallBias(wall)
  if (wall.a === vertexId) return localLeft ? bias.left : bias.right
  return localLeft ? bias.right : bias.left
}

function capAt(
  floor: Floor,
  wall: Wall,
  vertexId: string,
  other: Point,
  incidents: Map<string, Incident[]>,
): EndCap {
  const vertex = vertexOf(floor, vertexId)
  const leftW = outward(wall, vertexId, true)
  const rightW = outward(wall, vertexId, false)
  const fallback = vertex ? { x: vertex.x, y: vertex.y } : other
  if (!vertex || (leftW <= 0 && rightW <= 0)) return { right: fallback, left: fallback }
  const v = { x: vertex.x, y: vertex.y }
  const d = norm(sub(other, v))
  const n = left(d)
  const leftP = add(v, mul(n, leftW))
  const rightP = add(v, mul(n, -rightW))
  const neighbors = (incidents.get(vertexId) ?? []).filter((item) => item.wall.id !== wall.id && item.wall.thickness > 0)
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
    left: miter(v, leftP, d, leftW, ccw.dir, outward(ccw.wall, vertexId, false), true),
    right: miter(v, rightP, d, rightW, cw.dir, outward(cw.wall, vertexId, true), false),
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
  leftWidth: number,
  rightWidth: number,
  s0: number,
  s1: number,
  start: EndCap | null,
  end: EndCap | null,
): Point[] {
  const d = norm(sub(b, a))
  const n = left(d)
  const p0 = add(a, mul(d, s0))
  const p1 = add(a, mul(d, s1))
  const r0 = start ? start.right : add(p0, mul(n, -rightWidth))
  const l0 = start ? start.left : add(p0, mul(n, leftWidth))
  const r1 = end ? end.right : add(p1, mul(n, -rightWidth))
  const l1 = end ? end.left : add(p1, mul(n, leftWidth))
  return [r0, r1, l1, l0]
}

type GraphicsEntry = { dashed?: WallGraphics; solid?: WallGraphics }

const graphicsCache = new WeakMap<Floor, GraphicsEntry>()

export function wallGraphics(floor: Floor, includeDashed: boolean): WallGraphics {
  let entry = graphicsCache.get(floor)
  if (!entry) {
    entry = {}
    graphicsCache.set(floor, entry)
  }
  const key = includeDashed ? 'dashed' : 'solid'
  const cached = entry[key]
  if (cached) return cached
  const graphics = buildWallGraphics(floor, includeDashed)
  entry[key] = graphics
  return graphics
}

function buildWallGraphics(floor: Floor, includeDashed: boolean): WallGraphics {
  const solids: WallSolid[] = []
  const cuts: WallCut[] = []
  const dashes: WallDash[] = []
  const incidents = incidentIndex(floor)
  const openingsByWall = new Map<string, typeof floor.openings>()
  for (const opening of floor.openings) {
    const list = openingsByWall.get(opening.wallId)
    if (list) list.push(opening)
    else openingsByWall.set(opening.wallId, [opening])
  }

  for (const wall of floor.walls) {
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    const length = dist(ends.a, ends.b)
    if (length < 1e-6) continue
    if (wall.thickness <= 0) {
      if (includeDashed) dashes.push({ wallId: wall.id, a: ends.a, b: ends.b })
      continue
    }
    const openings = (openingsByWall.get(wall.id) ?? []).slice().sort((p, q) => p.offset - q.offset)
    const gaps: { s: number; e: number; openingId?: string; kind?: OpeningKind }[] = []
    let cursor = 0
    for (const opening of openings) {
      const start = Math.max(0, Math.min(length, opening.offset))
      const end = Math.max(start, Math.min(length, opening.offset + opening.width))
      if (start > cursor + 1e-4) gaps.push({ s: cursor, e: start })
      if (end - start > 1e-4) gaps.push({ s: start, e: end, openingId: opening.id, kind: opening.kind })
      cursor = Math.max(cursor, end)
    }
    if (length > cursor + 1e-4) gaps.push({ s: cursor, e: length })

    const startCap = capAt(floor, wall, wall.a, ends.b, incidents)
    // The end cap is measured back along the wall, so its left and right are swapped
    // relative to the direction from a to b.
    const endRaw = capAt(floor, wall, wall.b, ends.a, incidents)
    const endCap = { right: endRaw.left, left: endRaw.right }
    for (const gap of gaps) {
      const useStart = gap.s <= 1e-4
      const useEnd = gap.e >= length - 1e-4
      const bias = wallBias(wall)
      const points = quad(
        ends.a,
        ends.b,
        bias.left,
        bias.right,
        gap.s,
        gap.e,
        useStart ? startCap : null,
        useEnd ? endCap : null,
      )
      if (gap.openingId && gap.kind) {
        const d = norm(sub(ends.b, ends.a))
        cuts.push({
          wallId: wall.id,
          openingId: gap.openingId,
          kind: gap.kind,
          points,
          a: add(ends.a, mul(d, gap.s)),
          b: add(ends.a, mul(d, gap.e)),
        })
      } else solids.push({ wallId: wall.id, points })
    }
  }
  return { solids, cuts, dashes, joins: joinPolygons(floor, incidents) }
}

/** Многоугольник вокруг вершины, который не покрывает ни одна стена. */
function joinPolygons(floor: Floor, incidents: Map<string, Incident[]>): Point[][] {
  const seen = new Set<string>()
  const polygons: Point[][] = []
  for (const wall of floor.walls) {
    for (const vertexId of [wall.a, wall.b]) {
      if (seen.has(vertexId)) continue
      seen.add(vertexId)
      const arms = (incidents.get(vertexId) ?? []).filter((item) => item.wall.thickness > 0)
      if (arms.length < 3) continue
      const points: Point[] = []
      for (const arm of arms) {
        const cap = capAt(floor, arm.wall, vertexId, arm.other, incidents)
        points.push(cap.left, cap.right)
      }
      const hull = convexHull(points)
      if (hull.length >= 3) polygons.push(hull)
    }
  }
  return polygons
}

function convexHull(points: Point[]): Point[] {
  const unique: Point[] = []
  for (const point of points) {
    if (unique.some((item) => Math.abs(item.x - point.x) < 1e-6 && Math.abs(item.y - point.y) < 1e-6)) continue
    unique.push(point)
  }
  if (unique.length < 3) return []
  const sorted = unique.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: Point[] = []
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function alongWall(a: Point, b: Point, distance: number): Point {
  const d = norm(sub(b, a))
  return add(a, mul(d, distance))
}
