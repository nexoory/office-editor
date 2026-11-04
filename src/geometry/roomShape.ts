import type { Floor, Point } from '../types'
import type { AnalyzedFace } from './faces'
import { safeOffset } from './polygon'
import { wallBias } from './walls'

/** Пол помещения: контур грани, отодвинутый внутрь на толщину стены с этой стороны. */
export function floorShape(floor: Floor, face: AnalyzedFace) {
  return {
    outer: safeOffset(face.outer, edgeOffsets(floor, face.vertexIds, true), true),
    holes: face.holeIds.map((ids, index) => safeOffset(face.holes[index] ?? [], edgeOffsets(floor, ids, false), false)),
  }
}

/** Отступ пола от оси: с той стороны ребра, куда сдвигается контур. */
function edgeOffsets(floor: Floor, ids: string[], intoLeft: boolean): number[] {
  return ids.map((id, index) => {
    const next = ids[(index + 1) % ids.length]
    const wall = floor.walls.find((item) => (item.a === id && item.b === next) || (item.a === next && item.b === id))
    if (!wall) return 0
    const bias = wallBias(wall)
    const along = wall.a === id && wall.b === next
    const onLeft = along ? bias.left : bias.right
    const onRight = along ? bias.right : bias.left
    return intoLeft ? onLeft : onRight
  })
}

export function ringArea(points: Point[]): number {
  let sum = 0
  for (let index = 0; index < points.length; index++) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** Площадь пола в квадратных единицах холста, без стен и дыр. */
export function floorArea(shape: { outer: Point[]; holes: Point[][] }): number {
  return Math.max(0, ringArea(shape.outer) - shape.holes.reduce((sum, hole) => sum + ringArea(hole), 0))
}
