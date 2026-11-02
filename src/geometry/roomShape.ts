import type { Floor, Point } from '../types'
import type { AnalyzedFace } from './faces'
import { safeOffset } from './polygon'

/** Пол помещения: контур грани, отодвинутый от осей стен на половину их толщины. */
export function floorShape(floor: Floor, face: AnalyzedFace) {
  return {
    outer: safeOffset(face.outer, halfWidths(floor, face.vertexIds), true),
    holes: face.holeIds.map((ids, index) => safeOffset(face.holes[index] ?? [], halfWidths(floor, ids), false)),
  }
}

function halfWidths(floor: Floor, ids: string[]): number[] {
  return ids.map((id, index) => {
    const next = ids[(index + 1) % ids.length]
    const wall = floor.walls.find(
      (item) => (item.a === id && item.b === next) || (item.a === next && item.b === id),
    )
    return (wall?.thickness ?? 0) / 2
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
