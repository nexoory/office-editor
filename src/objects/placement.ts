import { CHAIR_GAP } from '../constants'
import type { Chair, PlanObject, Point } from '../types'
import { stairStepOf } from './catalog'

/** Поворот экрана по часовой: локальный +x смотрит вправо при нуле. */
export function localToWorld(object: Pick<PlanObject, 'x' | 'y' | 'rotation'>, local: Point): Point {
  const c = Math.cos(object.rotation)
  const s = Math.sin(object.rotation)
  return {
    x: object.x + local.x * c - local.y * s,
    y: object.y + local.x * s + local.y * c,
  }
}

export function worldToLocal(object: Pick<PlanObject, 'x' | 'y' | 'rotation'>, point: Point): Point {
  const c = Math.cos(object.rotation)
  const s = Math.sin(object.rotation)
  const dx = point.x - object.x
  const dy = point.y - object.y
  return { x: dx * c + dy * s, y: -dx * s + dy * c }
}

export function pointInFrame(
  frame: { x: number; y: number; rotation: number; length: number; width: number },
  point: Point,
  pad = 0,
): boolean {
  const local = worldToLocal(frame, point)
  return Math.abs(local.x) <= frame.length / 2 + pad && Math.abs(local.y) <= frame.width / 2 + pad
}

export function rotateHandlePoint(object: PlanObject, zoom: number): Point {
  return localToWorld(object, { x: object.length / 2 + 16 / zoom, y: 0 })
}

/**
 * Полные ступени — целая часть длины на шаг.
 * Остаток длиннее половины сантиметра становится короткой последней ступенью.
 * Если марш не длиннее шага, ступень одна, во всю длину.
 */
export function stairDepths(length: number, step: number): number[] {
  const span = Math.max(length, 0)
  const rise = Math.max(step, 1)
  if (span <= rise + 1e-6) return [span]
  const full = Math.floor((span + 1e-6) / rise)
  const rem = span - full * rise
  const depths = Array.from({ length: full }, () => rise)
  if (rem > 0.5) depths.push(rem)
  return depths.length > 0 ? depths : [span]
}

export function stairDepthsOf(object: PlanObject): number[] {
  return stairDepths(object.length, stairStepOf(object))
}

type EdgeLine = { edge: 0 | 1 | 2 | 3; a: Point; b: Point; outward: Point }

/** Стороны от угла (−длина/2, −ширина/2): верх, право, низ, лево. */
export function tableEdges(length: number, width: number): EdgeLine[] {
  const l = length / 2
  const w = width / 2
  return [
    { edge: 0, a: { x: -l, y: -w }, b: { x: l, y: -w }, outward: { x: 0, y: -1 } },
    { edge: 1, a: { x: l, y: -w }, b: { x: l, y: w }, outward: { x: 1, y: 0 } },
    { edge: 2, a: { x: l, y: w }, b: { x: -l, y: w }, outward: { x: 0, y: 1 } },
    { edge: 3, a: { x: -l, y: w }, b: { x: -l, y: -w }, outward: { x: -1, y: 0 } },
  ]
}

function projectEdge(point: Point, edge: EdgeLine): { u: number; distance: number; point: Point } {
  const abx = edge.b.x - edge.a.x
  const aby = edge.b.y - edge.a.y
  const l2 = abx * abx + aby * aby
  const u = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((point.x - edge.a.x) * abx + (point.y - edge.a.y) * aby) / l2))
  const on = { x: edge.a.x + abx * u, y: edge.a.y + aby * u }
  const dx = point.x - on.x
  const dy = point.y - on.y
  return { u, distance: Math.hypot(dx, dy), point: on }
}

export function nearestOnContour(length: number, width: number, local: Point): { edge: 0 | 1 | 2 | 3; u: number } {
  let best: { edge: 0 | 1 | 2 | 3; u: number; distance: number } | null = null
  for (const edge of tableEdges(length, width)) {
    const hit = projectEdge(local, edge)
    if (!best || hit.distance < best.distance) best = { edge: edge.edge, u: hit.u, distance: hit.distance }
  }
  return { edge: best?.edge ?? 0, u: best?.u ?? 0.5 }
}

/** Локальный поворот кресла: его +y смотрит от стола, лицо (−y) — к столу. */
export function chairLocalRotation(edge: 0 | 1 | 2 | 3): number {
  if (edge === 0) return Math.PI
  if (edge === 1) return -Math.PI / 2
  if (edge === 2) return 0
  return Math.PI / 2
}

export type ChairPose = { x: number; y: number; rotation: number; length: number; width: number }

export function chairPose(table: PlanObject, chair: Chair): ChairPose {
  const edges = tableEdges(table.length, table.width)
  const edge = edges[chair.edge] ?? edges[0]
  const along = {
    x: edge.a.x + (edge.b.x - edge.a.x) * chair.u,
    y: edge.a.y + (edge.b.y - edge.a.y) * chair.u,
  }
  const offset = CHAIR_GAP + chair.width / 2
  const local = { x: along.x + edge.outward.x * offset, y: along.y + edge.outward.y * offset }
  const world = localToWorld(table, local)
  return {
    x: world.x,
    y: world.y,
    rotation: table.rotation + chairLocalRotation(edge.edge),
    length: chair.length,
    width: chair.width,
  }
}

export function nextChairEdge(count: number): 0 | 1 | 2 | 3 {
  return (count % 4) as 0 | 1 | 2 | 3
}
