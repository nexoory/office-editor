import { SNAP_PX } from '../constants'
import type { Floor, Point } from '../types'
import { wallEnds } from './walls'

/** Вертикаль — общая координата x, горизонталь — общая y. */
export type AlignAxis = 'x' | 'y'

export type AlignRef = { axis: AlignAxis; value: number; cross: number }

export type AlignGuide = { axis: AlignAxis; value: number; from: number; to: number }

type Frame = { x: number; y: number; rotation: number; length: number; width: number }

const FACE_SLACK = 0.25

/** Точки текущей цепи, которых ещё нет среди вершин этажа. */
export function pointAlignRefs(points: Point[]): AlignRef[] {
  const refs: AlignRef[] = []
  for (const point of points) {
    refs.push({ axis: 'x', value: point.x, cross: point.y })
    refs.push({ axis: 'y', value: point.y, cross: point.x })
  }
  return refs
}

export function alignThreshold(zoom: number): number {
  return SNAP_PX / Math.max(zoom, 1e-6)
}

/** Центр, углы и середины кромок габарита. У оси-параллельного предмета середины кромок — это его стороны. */
export function objectProbes(frame: Frame): Point[] {
  const hx = frame.length / 2
  const hy = frame.width / 2
  const c = Math.cos(frame.rotation)
  const s = Math.sin(frame.rotation)
  const locals: Array<[number, number]> = [
    [0, 0],
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
    [0, -hy],
    [0, hy],
    [-hx, 0],
    [hx, 0],
  ]
  return locals.map(([lx, ly]) => ({
    x: frame.x + lx * c - ly * s,
    y: frame.y + lx * s + ly * c,
  }))
}

/**
 * Точки переносимой геометрии: вершины и, если стена едет целиком,
 * середина и обе грани толщины. Грани нужны, чтобы кромка стены села на кромку.
 */
export function geometryProbes(floor: Floor, vertexIds: string[]): Point[] {
  const ids = new Set(vertexIds)
  const probes: Point[] = []
  for (const id of vertexIds) {
    const vertex = floor.vertices.find((item) => item.id === id)
    if (vertex) probes.push({ x: vertex.x, y: vertex.y })
  }
  for (const wall of floor.walls) {
    if (!ids.has(wall.a) || !ids.has(wall.b)) continue
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    probes.push(...edgeProbes(ends.a, ends.b, wall.thickness))
  }
  return probes
}

export function translateProbes(probes: Point[], delta: Point): Point[] {
  return probes.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }))
}

/** Оси, с которыми можно совпасть: чужие точки, габариты предметов и грани прямых стен. */
export function collectAlignRefs(floor: Floor, excludeVertexIds: string[], excludeObjectIds: string[]): AlignRef[] {
  const skipVertex = new Set(excludeVertexIds)
  const skipObject = new Set(excludeObjectIds)
  const refs: AlignRef[] = []
  const addPoint = (x: number, y: number) => {
    refs.push({ axis: 'x', value: x, cross: y })
    refs.push({ axis: 'y', value: y, cross: x })
  }
  for (const vertex of floor.vertices) {
    if (skipVertex.has(vertex.id)) continue
    addPoint(vertex.x, vertex.y)
  }
  for (const object of floor.objects) {
    if (skipObject.has(object.id)) continue
    for (const point of objectProbes(object)) addPoint(point.x, point.y)
  }
  for (const wall of floor.walls) {
    if (wall.thickness <= 0) continue
    if (skipVertex.has(wall.a) || skipVertex.has(wall.b)) continue
    const ends = wallEnds(floor, wall)
    if (!ends) continue
    const dx = Math.abs(ends.a.x - ends.b.x)
    const dy = Math.abs(ends.a.y - ends.b.y)
    const mid = { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 }
    const half = wall.thickness / 2
    if (dx <= FACE_SLACK && dy > dx) {
      addPoint(mid.x - half, mid.y)
      addPoint(mid.x + half, mid.y)
    } else if (dy <= FACE_SLACK && dx > dy) {
      addPoint(mid.x, mid.y - half)
      addPoint(mid.x, mid.y + half)
    }
  }
  return refs
}

/**
 * Сдвиг, который сажает одну из точек на ближайшую ось.
 * `dir` — единичное направление, если движение уже ограничено (Shift или вдоль стены).
 */
export function snapToAlignments(
  probes: Point[],
  refs: AlignRef[],
  threshold: number,
  dir: Point | null,
  allow?: (delta: Point) => boolean,
): Point {
  if (probes.length === 0 || threshold <= 0) return { x: 0, y: 0 }
  const candidates = dir ? constrainedCandidates(probes, refs, threshold, unit(dir)) : freeCandidates(probes, refs, threshold)
  for (const delta of candidates) {
    if (!allow || allow(delta)) return delta
  }
  return { x: 0, y: 0 }
}

/** Линии между тем, что уже совпало. Короткий штрих на самой точке не рисуется. */
export function matchAlignGuides(probes: Point[], refs: AlignRef[], zoom: number): AlignGuide[] {
  const tolerance = 0.05
  const groups = new Map<string, { axis: AlignAxis; value: number; crosses: number[] }>()
  for (const probe of probes) {
    for (const axis of ['x', 'y'] as const) {
      const value = axis === 'x' ? probe.x : probe.y
      const cross = axis === 'x' ? probe.y : probe.x
      for (const ref of refs) {
        if (ref.axis !== axis || Math.abs(ref.value - value) > tolerance) continue
        const key = `${axis}:${ref.value.toFixed(2)}`
        const group = groups.get(key)
        if (group) group.crosses.push(cross, ref.cross)
        else groups.set(key, { axis, value: ref.value, crosses: [cross, ref.cross] })
      }
    }
  }
  const pad = 14 / zoom
  const minSpan = 2 / zoom
  const guides: AlignGuide[] = []
  for (const group of groups.values()) {
    const from = Math.min(...group.crosses)
    const to = Math.max(...group.crosses)
    if (to - from < minSpan) continue
    guides.push({ axis: group.axis, value: group.value, from: from - pad, to: to + pad })
  }
  return guides
}

function edgeProbes(a: Point, b: Point, thickness: number): Point[] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const probes = [mid]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (thickness <= 0 || length < 1e-6) return probes
  const nx = -dy / length
  const ny = dx / length
  const half = thickness / 2
  probes.push({ x: mid.x + nx * half, y: mid.y + ny * half })
  probes.push({ x: mid.x - nx * half, y: mid.y - ny * half })
  return probes
}

function unit(dir: Point): Point | null {
  const length = Math.hypot(dir.x, dir.y)
  if (length < 1e-8) return null
  return { x: dir.x / length, y: dir.y / length }
}

function freeCandidates(probes: Point[], refs: AlignRef[], threshold: number): Point[] {
  const xs = axisDeltas(probes, refs, 'x', threshold)
  const ys = axisDeltas(probes, refs, 'y', threshold)
  const dx = xs[0] ?? 0
  const dy = ys[0] ?? 0
  const candidates = [{ x: dx, y: dy }]
  if (dy !== 0) candidates.push({ x: dx, y: 0 })
  if (dx !== 0) candidates.push({ x: 0, y: dy })
  candidates.push({ x: 0, y: 0 })
  return candidates
}

function constrainedCandidates(probes: Point[], refs: AlignRef[], threshold: number, dir: Point | null): Point[] {
  if (!dir) return [{ x: 0, y: 0 }]
  const found: { t: number; abs: number }[] = []
  const seen = new Set<string>()
  for (const probe of probes) {
    for (const ref of refs) {
      const component = ref.axis === 'x' ? dir.x : dir.y
      if (Math.abs(component) < 1e-4) continue
      const origin = ref.axis === 'x' ? probe.x : probe.y
      const t = (ref.value - origin) / component
      const abs = Math.abs(t)
      if (abs > threshold) continue
      const key = t.toFixed(3)
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ t, abs })
    }
  }
  found.sort((a, b) => a.abs - b.abs)
  return [...found.map((item) => ({ x: dir.x * item.t, y: dir.y * item.t })), { x: 0, y: 0 }]
}

function axisDeltas(probes: Point[], refs: AlignRef[], axis: AlignAxis, threshold: number): number[] {
  const found: { delta: number; abs: number }[] = []
  const seen = new Set<string>()
  for (const probe of probes) {
    const origin = axis === 'x' ? probe.x : probe.y
    for (const ref of refs) {
      if (ref.axis !== axis) continue
      const delta = ref.value - origin
      const abs = Math.abs(delta)
      if (abs > threshold) continue
      const key = delta.toFixed(3)
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ delta, abs })
    }
  }
  found.sort((a, b) => a.abs - b.abs)
  return found.map((item) => item.delta)
}
