import { ALIGN_DEG, DEFAULT_THICKNESS, MIN_SPAN } from '../constants'
import type { SegmentEnd } from '../document'
import { thicknessAlongGhost } from '../document'
import type { Floor, Point } from '../types'
import { alignThreshold, collectAlignRefs, pointAlignRefs, snapToAlignments } from './align'
import { segmentRejected } from './collide'
import { formatLength } from './formatLength'
import { add, angleOf, constrainAngle, dist, left, mul, norm, projectLine, projectSegment, segmentParams, sub } from './math'
import { snapPoint, type SnapHit } from './snap'
import { alongWall, wallEnds, wallLengthOf } from './walls'

export type Preview = {
  start: SegmentEnd
  end: SegmentEnd
  thickness: number
  valid: boolean
  length: number
  closing: boolean
  snap: 'vertex' | 'close' | 'wall' | 'ghost' | 'none'
  onGhostAxis: boolean
}

export function segmentFromSnap(snap: SnapHit): SegmentEnd {
  if (snap.kind === 'vertex' && !snap.ghost) {
    return { x: snap.point.x, y: snap.point.y, vertexId: snap.vertexId }
  }
  if (snap.kind === 'wall') return { x: snap.point.x, y: snap.point.y, splitWallId: snap.wallId }
  return { x: snap.point.x, y: snap.point.y }
}

function clampToWalls(floor: Floor, anchor: Point, end: SegmentEnd): SegmentEnd {
  let bestT = 1
  let best: SegmentEnd | null = null
  const target = { x: end.x, y: end.y }
  for (const wall of floor.walls) {
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    const hit = segmentParams(anchor, target, ends.a, ends.b)
    if (!hit || hit.t <= 0.004 || hit.t >= bestT - 1e-6) continue
    const length = dist(ends.a, ends.b)
    const offset = hit.u * length
    const opening = floor.openings.find(
      (item) =>
        item.wallId === wall.id &&
        wall.thickness > 0 &&
        offset > item.offset + 1e-3 &&
        offset < item.offset + item.width - 1e-3,
    )
    if (opening) {
      const anchorOffset = projectLine(anchor, ends.a, ends.b).t * length
      let edge = opening.offset
      if (anchorOffset >= opening.offset + opening.width) edge = opening.offset + opening.width
      else if (anchorOffset > opening.offset) {
        const toStart = anchorOffset - opening.offset
        const toEnd = opening.offset + opening.width - anchorOffset
        edge = toStart <= toEnd ? opening.offset : opening.offset + opening.width
      }
      const edgePoint = alongWall(ends.a, ends.b, Math.max(0, Math.min(length, edge)))
      const ab = sub(target, anchor)
      const l2 = ab.x * ab.x + ab.y * ab.y
      const t = l2 < 1e-12 ? 1 : (sub(edgePoint, anchor).x * ab.x + sub(edgePoint, anchor).y * ab.y) / l2
      if (t > 0.004 && t < bestT) {
        bestT = t
        best = { x: edgePoint.x, y: edgePoint.y, splitWallId: wall.id }
      }
      continue
    }
    const nearA = dist(hit.point, ends.a) <= 1e-3
    const nearB = dist(hit.point, ends.b) <= 1e-3
    bestT = hit.t
    if (nearA) best = { x: ends.a.x, y: ends.a.y, vertexId: wall.a }
    else if (nearB) best = { x: ends.b.x, y: ends.b.y, vertexId: wall.b }
    else best = { x: hit.point.x, y: hit.point.y, splitWallId: wall.id }
  }
  return best ?? end
}

export function computePreview(options: {
  floor: Floor
  ghost: Floor | null
  anchor: SegmentEnd
  cursor: Point
  raw: Point
  shift: boolean
  zoom: number
  lockWallId: string | null
  chain: SegmentEnd[] | null
  /** Alt: без направляющих и без призрака, остаются точки и тело стен этажа. */
  free?: boolean
}): { preview: Preview; lockWallId: string | null } {
  const free = !!options.free
  const anchor = { x: options.anchor.x, y: options.anchor.y }
  const base = options.shift ? constrainAngle(anchor, options.cursor) : options.cursor
  const ray = options.shift
    ? { origin: anchor, angle: Math.atan2(base.y - anchor.y, base.x - anchor.x) }
    : null
  const exclude = [options.anchor.vertexId].filter((id): id is string => !!id)
  const chain = options.chain
  if (chain && chain.length < 3 && chain[0]?.vertexId) exclude.push(chain[0].vertexId)
  const snapped = snapPoint({
    cursor: base,
    raw: options.raw,
    floor: options.floor,
    ghost: options.ghost,
    zoom: options.zoom,
    allowGhost: !free,
    lockWallId: free ? null : options.lockWallId,
    excludeVertexIds: exclude,
    ray,
  })
  const extra = [anchor, ...(options.chain ?? []).map((point) => ({ x: point.x, y: point.y }))]
  let end = free
    ? segmentFromSnap(snapped.snap)
    : alignSegmentEnd(options.floor, segmentFromSnap(snapped.snap), anchor, options.zoom, snapped.snap, ray, exclude, extra)
  end = clampToWalls(options.floor, anchor, end)
  const closing = !!(
    chain &&
    chain.length >= 3 &&
    chain[0].vertexId &&
    end.vertexId === chain[0].vertexId
  )
  if (closing && chain) end = { x: chain[0].x, y: chain[0].y, vertexId: chain[0].vertexId }
  const ghostThickness = thicknessAlongGhost(options.ghost, anchor, end)
  const length = dist(anchor, end)
  const valid = length >= MIN_SPAN && !segmentRejected(options.floor, anchor, end)
  let snap: Preview['snap'] = 'none'
  if (closing) snap = 'close'
  else if (end.vertexId) snap = 'vertex'
  else if (end.splitWallId) snap = 'wall'
  else if (snapped.snap.kind === 'vertex' && snapped.snap.ghost) snap = 'ghost'
  else if (snapped.snap.kind === 'ghost-axis' && dist(end, snapped.snap.point) < 1e-3) snap = 'ghost'
  return {
    lockWallId: snapped.lockWallId,
    preview: {
      start: options.anchor,
      end,
      thickness: ghostThickness ?? DEFAULT_THICKNESS,
      valid,
      length,
      closing,
      snap,
      onGhostAxis: ghostThickness !== null,
    },
  }
}

export function anchorAt(
  floor: Floor,
  ghost: Floor | null,
  cursor: Point,
  zoom: number,
  lockWallId: string | null,
  free = false,
): { point: SegmentEnd; lockWallId: string | null } {
  const snapped = snapPoint({
    cursor,
    raw: cursor,
    floor,
    ghost,
    zoom,
    allowGhost: !free,
    lockWallId: free ? null : lockWallId,
  })
  const end = free
    ? segmentFromSnap(snapped.snap)
    : alignSegmentEnd(floor, segmentFromSnap(snapped.snap), cursor, zoom, snapped.snap, null)
  return { point: end, lockWallId: snapped.lockWallId }
}

/** Свободный конец или точка на стене садится на общую ось с уже стоящей геометрией. */
function alignSegmentEnd(
  floor: Floor,
  end: SegmentEnd,
  anchor: Point,
  zoom: number,
  snap: SnapHit,
  ray: { origin: Point; angle: number } | null,
  avoidVertexIds: string[] = [],
  extraPoints: Point[] = [],
): SegmentEnd {
  if (snap.kind !== 'free' && snap.kind !== 'wall') return end
  const point = { x: end.x, y: end.y }
  let dir: Point | null = null
  let span: { a: Point; b: Point } | null = null
  if (snap.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === snap.wallId)
    const ends = wall && wallEnds(floor, wall)
    if (ends) {
      dir = norm(sub(ends.b, ends.a))
      span = ends
    }
  } else if (ray) {
    dir = { x: Math.cos(ray.angle), y: Math.sin(ray.angle) }
  }
  const threshold = alignThreshold(zoom)
  const refs = [...collectAlignRefs(floor, [], []), ...pointAlignRefs(extraPoints)]
  const delta = snapToAlignments([point], refs, threshold, dir, (correction) => {
    const next = add(point, correction)
    if (span) {
      const projected = projectSegment(next, span.a, span.b)
      if (projected.distance > 0.75 || projected.t <= 0.002 || projected.t >= 0.998) return false
    }
    const nextDist = dist(next, anchor)
    const fromDist = dist(point, anchor)
    if (nextDist + 0.25 < fromDist && nextDist <= threshold) return false
    for (const id of avoidVertexIds) {
      const vertex = floor.vertices.find((item) => item.id === id)
      if (vertex && dist(next, vertex) <= 0.5) return false
    }
    return true
  })
  const moved = add(point, delta)
  const adopted = adoptGeometry(floor, moved, anchor, new Set(avoidVertexIds))
  if (adopted) return adopted
  if (end.splitWallId && span) {
    const projected = projectSegment(moved, span.a, span.b)
    return { x: projected.point.x, y: projected.point.y, splitWallId: end.splitWallId }
  }
  return { x: moved.x, y: moved.y }
}

function adoptGeometry(floor: Floor, point: Point, anchor: Point, avoid: Set<string>): SegmentEnd | null {
  for (const vertex of floor.vertices) {
    if (avoid.has(vertex.id) || dist(vertex, anchor) <= 0.05) continue
    if (dist(point, vertex) <= 0.05) return { x: vertex.x, y: vertex.y, vertexId: vertex.id }
  }
  for (const wall of floor.walls) {
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    const projected = projectSegment(point, ends.a, ends.b)
    if (projected.distance <= 0.05 && projected.t > 0.001 && projected.t < 0.999) {
      return { x: projected.point.x, y: projected.point.y, splitWallId: wall.id }
    }
  }
  return null
}

export type Guide = { a: Point; b: Point }
export type LengthLabel = { x: number; y: number; text: string }

export function lengthLabel(a: Point, b: Point, zoom: number, text: string): LengthLabel {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const n = left(norm(sub(b, a)))
  const point = add(mid, mul(n, 14 / zoom))
  return { x: point.x, y: point.y, text }
}

export function alignmentGuides(floor: Floor, vertexIds: string[], zoom: number): Guide[] {
  const limit = (ALIGN_DEG * Math.PI) / 180
  const guides: Guide[] = []
  const seen = new Set<string>()
  for (const id of vertexIds) {
    const vertex = floor.vertices.find((item) => item.id === id)
    if (!vertex) continue
    const links = floor.walls.flatMap((wall) => {
      const ends = wallEnds(floor, wall)
      if (!ends) return []
      if (wall.a === id) return [{ wallId: wall.id, other: ends.b }]
      if (wall.b === id) return [{ wallId: wall.id, other: ends.a }]
      return []
    })
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        let delta = Math.abs(angleOf(vertex, links[i].other) - angleOf(vertex, links[j].other)) % Math.PI
        if (delta > Math.PI / 2) delta = Math.PI - delta
        const aligned = [0, Math.PI / 4, Math.PI / 2].some((target) => Math.abs(delta - target) < limit)
        if (!aligned) continue
        for (const link of [links[i], links[j]]) {
          const key = `${id}:${link.wallId}`
          if (seen.has(key)) continue
          seen.add(key)
          const dir = norm(sub(link.other, vertex))
          if (dir.x === 0 && dir.y === 0) continue
          const stub = 16 / zoom
          guides.push({ a: vertex, b: add(vertex, mul(dir, -stub)) })
          guides.push({ a: link.other, b: add(link.other, mul(dir, stub)) })
        }
      }
    }
  }
  return guides
}

export function incidentWallIds(floor: Floor, vertexId: string): string[] {
  return floor.walls.filter((wall) => wall.a === vertexId || wall.b === vertexId).map((wall) => wall.id)
}

export function labelForWall(floor: Floor, wallId: string, zoom: number): LengthLabel | null {
  const wall = floor.walls.find((item) => item.id === wallId)
  const ends = wall && wallEnds(floor, wall)
  if (!wall || !ends) return null
  return lengthLabel(ends.a, ends.b, zoom, formatLength(wallLengthOf(floor, wall)))
}
