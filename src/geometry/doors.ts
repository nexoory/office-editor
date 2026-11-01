import { add, dist, mul, norm, sub } from './math'
import type { Opening, Point } from '../types'

export const DOOR_SWING = (35 * Math.PI) / 180

/** Экранная левая полуплоскость взгляда от a к b. */
export function screenLeft(direction: Point): Point {
  return { x: direction.y, y: -direction.x }
}

export type DoorSwing = { hinge: Point; tip: Point; normal: Point }

export function doorSwing(a: Point, b: Point, opening: Opening): DoorSwing | null {
  if (opening.kind !== 'door') return null
  if (dist(a, b) < 1e-6 || opening.width <= 0) return null
  const dir = norm(sub(b, a))
  const hingeAt = opening.hinge === 'end' ? opening.offset + opening.width : opening.offset
  const hinge = add(a, mul(dir, hingeAt))
  const along = opening.hinge === 'end' ? mul(dir, -1) : dir
  const left = screenLeft(dir)
  const normal = opening.side === 'right' ? mul(left, -1) : left
  const swing = norm(add(mul(along, Math.cos(DOOR_SWING)), mul(normal, Math.sin(DOOR_SWING))))
  return { hinge, tip: add(hinge, mul(swing, opening.width)), normal }
}
