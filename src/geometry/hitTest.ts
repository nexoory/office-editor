import { chairsOf } from '../objects/catalog'
import { chairPose, pointInFrame, rotateHandlePoint } from '../objects/placement'
import type { Floor, Point, Selection } from '../types'
import { doorSwing } from './doors'
import { analyze, ringPoints } from './faces'
import { dist, pointInPolygon, pointInRegion, projectSegment } from './math'
import { wallEnds, wallLengthOf } from './walls'

export type Hit =
  | { kind: 'opening'; id: string }
  | { kind: 'vertex'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'rotate'; id: string }
  | { kind: 'chair'; objectId: string; chairId: string }
  | { kind: 'object'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'ghost-wall'; id: string }
  | { kind: 'empty' }

const VERTEX_PX = 8
const WALL_PX = 6

function openingAt(floor: Floor, wallId: string, offset: number, slack = 0): boolean {
  return floor.openings.some(
    (opening) =>
      opening.wallId === wallId &&
      offset > opening.offset - slack &&
      offset < opening.offset + opening.width + slack,
  )
}

export function hitTest(
  floor: Floor,
  ghost: Floor | null,
  point: Point,
  zoom: number,
  editing: boolean,
  button: 'left' | 'right',
  selection: Selection | null = null,
): Hit {
  const vertexR = VERTEX_PX / zoom
  const slop = WALL_PX / zoom

  if (editing) {
    let bestOpening: { id: string; score: number } | null = null
    for (const wall of floor.walls) {
      if (wall.thickness <= 0) continue
      const ends = wallEnds(floor, wall)
      if (!ends) continue
      const length = wallLengthOf(floor, wall)
      const half = wall.thickness / 2
      for (const opening of floor.openings) {
        if (opening.wallId !== wall.id) continue
        const proj = projectSegment(point, ends.a, ends.b)
        const offset = proj.t * length
        let score: number | null = null
        if (
          offset >= opening.offset - 0.5 &&
          offset <= opening.offset + opening.width + 0.5 &&
          proj.distance <= half + slop
        ) {
          score = proj.distance
        }
        const swing = doorSwing(ends.a, ends.b, opening)
        if (swing) {
          const leaf = projectSegment(point, swing.hinge, swing.tip)
          if (leaf.distance <= 2.25 + slop) score = score === null ? leaf.distance : Math.min(score, leaf.distance)
        }
        if (score === null) continue
        if (!bestOpening || score < bestOpening.score) bestOpening = { id: opening.id, score }
      }
    }
    if (bestOpening) return { kind: 'opening', id: bestOpening.id }

    let bestVertex: { id: string; score: number } | null = null
    for (const vertex of floor.vertices) {
      const score = dist(point, vertex)
      if (score <= vertexR && (!bestVertex || score < bestVertex.score)) {
        bestVertex = { id: vertex.id, score }
      }
    }
    if (bestVertex) return { kind: 'vertex', id: bestVertex.id }

    if (selection?.kind === 'object') {
      const selected = floor.objects.find((object) => object.id === selection.id)
      if (selected && dist(point, rotateHandlePoint(selected, zoom)) <= 10 / zoom) {
        return { kind: 'rotate', id: selected.id }
      }
    }

    let bestWall: { id: string; score: number } | null = null
    for (const wall of floor.walls) {
      const ends = wallEnds(floor, wall)
      if (!ends) continue
      const proj = projectSegment(point, ends.a, ends.b)
      const reach = wall.thickness > 0 ? wall.thickness / 2 + slop : editing ? slop : 0
      if (wall.thickness <= 0 && !editing) continue
      if (proj.distance > reach) continue
      const offset = proj.t * wallLengthOf(floor, wall)
      if (wall.thickness > 0 && openingAt(floor, wall.id, offset)) continue
      if (!bestWall || proj.distance < bestWall.score) bestWall = { id: wall.id, score: proj.distance }
    }
    if (bestWall) return { kind: 'wall', id: bestWall.id }
  }

  const furniture = hitFurniture(floor, point, editing)
  if (furniture) return furniture

  const analysis = analyze(floor)
  let bestRoom: { id: string; area: number } | null = null
  for (const face of analysis.faces) {
    if (!pointInRegion(point, face.outer, face.holes)) continue
    const room = floor.rooms.find((item) => sameLoop(item.vertexIds, face.vertexIds))
    if (!room) continue
    if (!bestRoom || face.area < bestRoom.area) bestRoom = { id: room.id, area: face.area }
  }
  if (bestRoom) return { kind: 'room', id: bestRoom.id }

  if (button === 'right' && editing && ghost) {
    let bestGhost: { id: string; score: number } | null = null
    for (const wall of ghost.walls) {
      const ends = wallEnds(ghost, wall)
      if (!ends) continue
      if (wall.thickness <= 0 && !editing) continue
      const proj = projectSegment(point, ends.a, ends.b)
      const reach = wall.thickness > 0 ? wall.thickness / 2 + slop : slop
      if (proj.distance > reach) continue
      const covered = floor.walls.some((current) => {
        if (current.thickness <= 0) return false
        const currentEnds = wallEnds(floor, current)
        if (!currentEnds) return false
        const on = projectSegment(point, currentEnds.a, currentEnds.b)
        return on.distance <= current.thickness / 2
      })
      if (covered) continue
      if (!bestGhost || proj.distance < bestGhost.score) bestGhost = { id: wall.id, score: proj.distance }
    }
    if (bestGhost) return { kind: 'ghost-wall', id: bestGhost.id }
  }

  return { kind: 'empty' }
}

function hitFurniture(floor: Floor, point: Point, editing: boolean): Hit | null {
  for (let index = floor.objects.length - 1; index >= 0; index--) {
    const object = floor.objects[index]
    if (!object) continue
    const chairs = chairsOf(object)
    for (let chairIndex = chairs.length - 1; chairIndex >= 0; chairIndex--) {
      const chair = chairs[chairIndex]
      if (!chair || !pointInFrame(chairPose(object, chair), point)) continue
      if (!editing) return { kind: 'object', id: object.id }
      return { kind: 'chair', objectId: object.id, chairId: chair.id }
    }
  }
  for (let index = floor.objects.length - 1; index >= 0; index--) {
    const object = floor.objects[index]
    if (object && pointInFrame(object, point)) return { kind: 'object', id: object.id }
  }
  return null
}

function sameLoop(a: string[], b: string[]): boolean {
  if (a.length !== b.length || a.length === 0) return false
  const key = a.join('\0')
  const doubled = b.concat(b)
  for (let i = 0; i < b.length; i++) {
    if (doubled.slice(i, i + a.length).join('\0') === key) return true
  }
  return false
}

export function selectionAnchor(floor: Floor, selection: Selection): Point | null {
  if (selection.kind === 'vertex') {
    const vertex = floor.vertices.find((item) => item.id === selection.id)
    return vertex ? { x: vertex.x, y: vertex.y } : null
  }
  if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    if (!wall) return null
    const ends = wallEnds(floor, wall)
    if (!ends) return null
    return { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 }
  }
  if (selection.kind === 'opening') {
    const opening = floor.openings.find((item) => item.id === selection.id)
    const wall = opening && floor.walls.find((item) => item.id === opening.wallId)
    if (!opening || !wall) return null
    const ends = wallEnds(floor, wall)
    if (!ends) return null
    const length = dist(ends.a, ends.b) || 1
    const t = (opening.offset + opening.width / 2) / length
    return {
      x: ends.a.x + (ends.b.x - ends.a.x) * t,
      y: ends.a.y + (ends.b.y - ends.a.y) * t,
    }
  }
  if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    return object ? { x: object.x, y: object.y } : null
  }
  if (selection.kind === 'chair') {
    const table = floor.objects.find((item) => item.id === selection.objectId)
    const chair = table && chairsOf(table).find((item) => item.id === selection.chairId)
    if (!table || !chair) return null
    const pose = chairPose(table, chair)
    return { x: pose.x, y: pose.y }
  }
  const room = floor.rooms.find((item) => item.id === selection.id)
  if (!room) return null
  const points = ringPoints(floor, room.vertexIds)
  if (points.length === 0) return null
  const probe = interiorPointSafe(points)
  return probe
}

function interiorPointSafe(points: Point[]): Point {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  const centroid = { x: x / points.length, y: y / points.length }
  if (pointInPolygon(centroid, points)) return centroid
  return points[0]
}

export function hitMatchesSelection(hit: Hit, selection: Selection | null): boolean {
  if (!selection) return false
  if (hit.kind === 'empty' || hit.kind === 'ghost-wall') return false
  if (hit.kind === 'chair' && selection.kind === 'chair') {
    return hit.objectId === selection.objectId && hit.chairId === selection.chairId
  }
  if (hit.kind === 'rotate' && selection.kind === 'object') return hit.id === selection.id
  if (hit.kind === 'chair' || hit.kind === 'rotate') return false
  return hit.kind === selection.kind && hit.id === selection.id
}
