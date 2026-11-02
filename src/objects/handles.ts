import { dist } from '../geometry/math'
import type { PlanObject, Point } from '../types'
import { localToWorld } from './placement'

export type ObjectHandle = 'rotate' | 'resize'

/** Отступ ручки поворота от верхней кромки и радиусы ручек — в пикселях экрана. */
export const ROTATE_STEM_PX = 26
export const HANDLE_R_PX = 6
const HANDLE_HIT_PX = 10

export function handlePoints(object: PlanObject, zoom: number): { rotate: Point; stem: Point; resize: Point } {
  return {
    stem: localToWorld(object, { x: 0, y: -object.width / 2 }),
    rotate: localToWorld(object, { x: 0, y: -object.width / 2 - ROTATE_STEM_PX / zoom }),
    resize: localToWorld(object, { x: object.length / 2, y: object.width / 2 }),
  }
}

export function handleAt(object: PlanObject, point: Point, zoom: number): ObjectHandle | null {
  const points = handlePoints(object, zoom)
  const reach = HANDLE_HIT_PX / zoom
  const rotate = dist(point, points.rotate)
  const resize = dist(point, points.resize)
  if (resize <= reach && resize <= rotate) return 'resize'
  if (rotate <= reach) return 'rotate'
  return null
}
