import { GHOST_BREAK_PX, SNAP_PX } from '../constants'
import type { Floor, Point } from '../types'
import { dist, distToRay, projectLine, projectSegment } from './math'
import { wallEnds, wallLengthOf } from './walls'

export type SnapHit =
  | { kind: 'vertex'; point: Point; vertexId: string; ghost: boolean }
  | { kind: 'wall'; point: Point; wallId: string; offset: number }
  | { kind: 'ghost-axis'; point: Point; wallId: string }
  | { kind: 'free'; point: Point }

export function snapPoint(options: {
  cursor: Point
  raw: Point
  floor: Floor
  ghost: Floor | null
  zoom: number
  allowGhost: boolean
  lockWallId: string | null
  excludeVertexIds?: string[]
  excludeWallIds?: string[]
  ray?: { origin: Point; angle: number } | null
}): { snap: SnapHit; lockWallId: string | null } {
  const radius = SNAP_PX / options.zoom
  const breakRadius = GHOST_BREAK_PX / options.zoom
  const exclude = new Set(options.excludeVertexIds ?? [])
  const excludeWalls = new Set(options.excludeWallIds ?? [])

  if (options.allowGhost && options.lockWallId && options.ghost) {
    const wall = options.ghost.walls.find((item) => item.id === options.lockWallId)
    const ends = wall && wallEnds(options.ghost, wall)
    if (wall && ends) {
      const axis = projectLine(options.raw, ends.a, ends.b)
      const rayOk =
        !options.ray ||
        distToRay(axis.point, options.ray.origin, options.ray.angle) <= 2 / options.zoom
      if (axis.distance <= breakRadius && rayOk) {
        return {
          snap: { kind: 'ghost-axis', point: axis.point, wallId: wall.id },
          lockWallId: wall.id,
        }
      }
    }
  }

  let bestVertex: { point: Point; vertexId: string; ghost: boolean; distance: number } | null = null
  const considerVertex = (point: Point, id: string, ghost: boolean) => {
    if (exclude.has(id)) return
    if (options.ray && ghost && distToRay(point, options.ray.origin, options.ray.angle) > 2 / options.zoom) {
      return
    }
    const distance = dist(options.cursor, point)
    if (distance <= radius && (!bestVertex || distance < bestVertex.distance)) {
      bestVertex = { point: { x: point.x, y: point.y }, vertexId: id, ghost, distance }
    }
  }
  for (const vertex of options.floor.vertices) considerVertex(vertex, vertex.id, false)
  if (bestVertex) {
    const chosen = bestVertex as { point: Point; vertexId: string; ghost: boolean }
    return {
      snap: { kind: 'vertex', point: chosen.point, vertexId: chosen.vertexId, ghost: false },
      lockWallId: null,
    }
  }

  let bestWall: { point: Point; wallId: string; offset: number; distance: number } | null = null
  for (const wall of options.floor.walls) {
    if (excludeWalls.has(wall.id)) continue
    const ends = wallEnds(options.floor, wall)
    if (!ends) continue
    const proj = projectSegment(options.cursor, ends.a, ends.b)
    if (proj.distance > radius || proj.t <= 0.001 || proj.t >= 0.999) continue
    const length = wallLengthOf(options.floor, wall)
    const offset = proj.t * length
    if (insideOpening(options.floor, wall.id, offset)) continue
    if (!bestWall || proj.distance < bestWall.distance) {
      bestWall = { point: proj.point, wallId: wall.id, offset, distance: proj.distance }
    }
  }
  if (bestWall) {
    return {
      snap: { kind: 'wall', point: bestWall.point, wallId: bestWall.wallId, offset: bestWall.offset },
      lockWallId: null,
    }
  }

  if (options.allowGhost && options.ghost) {
    for (const vertex of options.ghost.vertices) considerVertex(vertex, vertex.id, true)
    if (bestVertex) {
      const chosen = bestVertex as { point: Point; vertexId: string; ghost: boolean }
      return {
        snap: { kind: 'vertex', point: chosen.point, vertexId: chosen.vertexId, ghost: true },
        lockWallId: null,
      }
    }
    let bestAxis: { point: Point; wallId: string; distance: number } | null = null
    for (const wall of options.ghost.walls) {
      const ends = wallEnds(options.ghost, wall)
      if (!ends) continue
      const proj = projectSegment(options.cursor, ends.a, ends.b)
      if (proj.distance > radius) continue
      if (options.ray && distToRay(proj.point, options.ray.origin, options.ray.angle) > 2 / options.zoom) {
        continue
      }
      if (!bestAxis || proj.distance < bestAxis.distance) {
        bestAxis = { point: proj.point, wallId: wall.id, distance: proj.distance }
      }
    }
    if (bestAxis) {
      const wall = options.ghost.walls.find((item) => item.id === bestAxis?.wallId)
      const ends = wall && wallEnds(options.ghost, wall)
      const point = ends ? projectLine(options.cursor, ends.a, ends.b).point : bestAxis.point
      return {
        snap: { kind: 'ghost-axis', point, wallId: bestAxis.wallId },
        lockWallId: bestAxis.wallId,
      }
    }
  }

  return { snap: { kind: 'free', point: options.cursor }, lockWallId: null }
}

function insideOpening(floor: Floor, wallId: string, offset: number): boolean {
  return floor.openings.some(
    (opening) =>
      opening.wallId === wallId &&
      offset > opening.offset + 1e-4 &&
      offset < opening.offset + opening.width - 1e-4,
  )
}
