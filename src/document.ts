import { DEFAULT_OPENING_WIDTH, MAX_THICKNESS, MIN_SPAN, MIN_THICKNESS } from './constants'
import { segmentRejected } from './geometry/collide'
import { analyze, canonicalize, sameIds } from './geometry/faces'
import { dist, interiorPoint, pointInRegion, projectLine, projectSegment } from './geometry/math'
import { regionIntersectArea, sharedBoundary, type Region } from './geometry/polygon'
import { wallEnds, wallLengthOf } from './geometry/walls'
import type { Document, Floor, Opening, OpeningKind, Point, Room, Selection, Wall } from './types'

export type SegmentEnd = {
  x: number
  y: number
  vertexId?: string
  splitWallId?: string
}

export type OpeningFrac = { id: string; wallId: string; fraction: number; width: number }

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createFloor(name: string): Floor {
  return { id: newId(), name, vertices: [], walls: [], openings: [], rooms: [], objects: [] }
}

export function createDocument(): Document {
  return { floors: [createFloor('Этаж 1')] }
}

export function nextFloorName(floors: Floor[]): string {
  const used = new Set<number>()
  for (const floor of floors) {
    const match = /^Этаж (\d+)$/.exec(floor.name.trim())
    if (match) used.add(Number(match[1]))
  }
  let n = 1
  while (used.has(n)) n++
  return `Этаж ${n}`
}

export function thicknessAlongGhost(ghost: Floor | null, a: Point, b: Point): number | null {
  if (!ghost) return null
  let found: number | null = null
  for (const wall of ghost.walls) {
    const ends = wallEnds(ghost, wall)
    if (!ends) continue
    if (projectLine(a, ends.a, ends.b).distance > 1e-2) continue
    if (projectLine(b, ends.a, ends.b).distance > 1e-2) continue
    found = wall.thickness
  }
  return found
}

function cleanup(floor: Floor): Floor {
  const used = new Set<string>()
  for (const wall of floor.walls) {
    used.add(wall.a)
    used.add(wall.b)
  }
  const walls = new Set(floor.walls.map((wall) => wall.id))
  return {
    ...floor,
    vertices: floor.vertices.filter((vertex) => used.has(vertex.id)),
    openings: floor.openings.filter((opening) => walls.has(opening.wallId)),
  }
}

type OldShape = { region: Region; rings: Point[][]; area: number }

function shapesOf(floor: Floor): Map<string, OldShape> {
  const analysis = analyze(floor)
  const map = new Map<string, OldShape>()
  for (const room of floor.rooms) {
    const face = analysis.faces.find((item) => sameIds(item.vertexIds, canonicalize(room.vertexIds)))
    if (!face) continue
    map.set(room.id, {
      region: { outer: face.outer, holes: face.holes },
      rings: [face.outer, ...face.holes],
      area: face.area,
    })
  }
  return map
}

function boundaryScore(a: Point[][], b: Point[][]): number {
  let score = 0
  for (const left of a) {
    for (const right of b) score += sharedBoundary(left, right)
  }
  return score
}

function preferRoom(
  a: { area: number; index: number; id: string },
  b: { area: number; index: number; id: string },
  selection: Selection | null,
): number {
  if (a.area > b.area + 1e-6) return -1
  if (b.area > a.area + 1e-6) return 1
  if (selection?.kind === 'room' && selection.id === a.id) return -1
  if (selection?.kind === 'room' && selection.id === b.id) return 1
  return a.index - b.index
}

export function syncRooms(
  before: Floor,
  after: Floor,
  selection: Selection | null,
  dropIds: string[] = [],
): Floor {
  const analysis = analyze(after)
  const previous = shapesOf(before)
  const drop = new Set(dropIds)
  type Nominee = { room: Room; face: number; index: number; area: number }
  const byFace = new Map<number, Nominee[]>()

  before.rooms.forEach((room, index) => {
    if (drop.has(room.id)) return
    const shape = previous.get(room.id)
    if (!shape) return
    let best: { face: number; boundary: number; overlap: number } | null = null
    for (const face of analysis.faces) {
      if (sameIds(face.vertexIds, canonicalize(room.vertexIds))) {
        best = { face: face.index, boundary: Number.POSITIVE_INFINITY, overlap: Number.POSITIVE_INFINITY }
        break
      }
      const overlap = regionIntersectArea(shape.region, { outer: face.outer, holes: face.holes })
      const probe = shape.region.outer.length >= 3 ? interiorPoint(shape.region.outer) : null
      const inside = !!probe && pointInRegion(probe, face.outer, face.holes)
      const threshold = Math.max(0.25, Math.min(shape.area, face.area) * 0.08)
      if (overlap <= threshold && !inside) continue
      const boundary = boundaryScore(shape.rings, [face.outer, ...face.holes])
      if (
        !best ||
        boundary > best.boundary + 1e-3 ||
        (Math.abs(boundary - best.boundary) <= 1e-3 && overlap > best.overlap)
      ) {
        best = { face: face.index, boundary, overlap }
      }
    }
    if (!best) return
    const list = byFace.get(best.face) ?? []
    list.push({ room, face: best.face, index, area: shape.area })
    byFace.set(best.face, list)
  })

  const rooms: Room[] = []
  const used = new Set<number>()
  const winners = [...byFace.entries()]
    .map(([face, list]) => {
      const sorted = list.slice().sort((a, b) => preferRoom(
        { area: a.area, index: a.index, id: a.room.id },
        { area: b.area, index: b.index, id: b.room.id },
        selection,
      ))
      return { face, room: sorted[0].room, index: sorted[0].index }
    })
    .sort((a, b) => a.index - b.index)

  for (const winner of winners) {
    const face = analysis.faces.find((item) => item.index === winner.face)
    if (!face) continue
    used.add(face.index)
    rooms.push({ ...winner.room, vertexIds: face.vertexIds })
  }
  for (const face of analysis.faces) {
    if (used.has(face.index)) continue
    rooms.push({ id: newId(), vertexIds: face.vertexIds, name: '', color: null, icon: null })
  }
  return { ...after, rooms }
}

function splitWall(floor: Floor, wallId: string, point: Point): { floor: Floor; vertexId: string } | null {
  const wall = floor.walls.find((item) => item.id === wallId)
  const ends = wall && wallEnds(floor, wall)
  if (!wall || !ends) return null
  const length = dist(ends.a, ends.b)
  const proj = projectSegment(point, ends.a, ends.b)
  if (proj.t <= 1e-4) return { floor, vertexId: wall.a }
  if (proj.t >= 1 - 1e-4) return { floor, vertexId: wall.b }
  const offset = proj.t * length
  const blocked = floor.openings.some(
    (opening) =>
      opening.wallId === wall.id &&
      offset > opening.offset + 1e-4 &&
      offset < opening.offset + opening.width - 1e-4,
  )
  if (blocked) return null
  const vertexId = newId()
  const first: Wall = { id: newId(), a: wall.a, b: vertexId, thickness: wall.thickness }
  const second: Wall = { id: newId(), a: vertexId, b: wall.b, thickness: wall.thickness }
  const openings = floor.openings.map((opening) => {
    if (opening.wallId !== wall.id) return opening
    if (opening.offset + opening.width <= offset + 1e-4) return { ...opening, wallId: first.id }
    if (opening.offset >= offset - 1e-4) {
      return { ...opening, wallId: second.id, offset: Math.max(0, opening.offset - offset) }
    }
    const onFirst = offset - opening.offset
    const onSecond = opening.offset + opening.width - offset
    if (onFirst >= onSecond) return { ...opening, wallId: first.id, width: Math.max(MIN_SPAN, onFirst) }
    return { ...opening, wallId: second.id, offset: 0, width: Math.max(MIN_SPAN, onSecond) }
  })
  return {
    vertexId,
    floor: {
      ...floor,
      vertices: [...floor.vertices, { id: vertexId, x: proj.point.x, y: proj.point.y }],
      walls: floor.walls.filter((item) => item.id !== wall.id).concat(first, second),
      openings,
    },
  }
}

function resolveEnd(floor: Floor, end: SegmentEnd): { floor: Floor; id: string } | null {
  if (end.vertexId && floor.vertices.some((vertex) => vertex.id === end.vertexId)) {
    return { floor, id: end.vertexId }
  }
  const near = floor.vertices.find((vertex) => dist(vertex, end) <= 1e-3)
  if (near) return { floor, id: near.id }
  let wallId = end.splitWallId
  if (wallId && !floor.walls.some((wall) => wall.id === wallId)) wallId = undefined
  if (!wallId) {
    for (const wall of floor.walls) {
      const ends = wallEnds(floor, wall)
      if (!ends) continue
      const proj = projectSegment(end, ends.a, ends.b)
      if (proj.distance <= 1e-3 && proj.t > 1e-3 && proj.t < 1 - 1e-3) {
        wallId = wall.id
        break
      }
    }
  }
  if (wallId) {
    const split = splitWall(floor, wallId, end)
    if (!split) return null
    return { floor: split.floor, id: split.vertexId }
  }
  const id = newId()
  return { id, floor: { ...floor, vertices: [...floor.vertices, { id, x: end.x, y: end.y }] } }
}

export function addSegmentGraph(
  floor: Floor,
  start: SegmentEnd,
  end: SegmentEnd,
  thickness: number,
): { floor: Floor; wallId: string; startId: string; endId: string } | null {
  if (dist(start, end) < MIN_SPAN) return null
  if (segmentRejected(floor, start, end)) return null
  const resolvedStart = resolveEnd(floor, start)
  if (!resolvedStart) return null
  const resolvedEnd = resolveEnd(resolvedStart.floor, end)
  if (!resolvedEnd || resolvedStart.id === resolvedEnd.id) return null
  const exists = resolvedEnd.floor.walls.some(
    (wall) =>
      (wall.a === resolvedStart.id && wall.b === resolvedEnd.id) ||
      (wall.a === resolvedEnd.id && wall.b === resolvedStart.id),
  )
  if (exists) return null
  const a = resolvedEnd.floor.vertices.find((vertex) => vertex.id === resolvedStart.id)
  const b = resolvedEnd.floor.vertices.find((vertex) => vertex.id === resolvedEnd.id)
  if (!a || !b || segmentRejected(resolvedEnd.floor, a, b)) return null
  const wallId = newId()
  return {
    wallId,
    startId: resolvedStart.id,
    endId: resolvedEnd.id,
    floor: {
      ...resolvedEnd.floor,
      walls: [...resolvedEnd.floor.walls, { id: wallId, a: resolvedStart.id, b: resolvedEnd.id, thickness }],
    },
  }
}

export function addSegment(
  floor: Floor,
  start: SegmentEnd,
  end: SegmentEnd,
  thickness: number,
  selection: Selection | null,
): { floor: Floor; wallId: string; startId: string; endId: string } | null {
  const graph = addSegmentGraph(floor, start, end, thickness)
  if (!graph) return null
  return { ...graph, floor: syncRooms(floor, graph.floor, selection) }
}

export function deleteOpening(floor: Floor, openingId: string): Floor {
  return { ...floor, openings: floor.openings.filter((opening) => opening.id !== openingId) }
}

export function deleteWall(floor: Floor, wallId: string, selection: Selection | null): Floor {
  const next = cleanup({
    ...floor,
    walls: floor.walls.filter((wall) => wall.id !== wallId),
    openings: floor.openings.filter((opening) => opening.wallId !== wallId),
  })
  return syncRooms(floor, next, selection)
}

export function deleteVertex(floor: Floor, vertexId: string, selection: Selection | null): Floor | null {
  const touching = floor.walls.filter((wall) => wall.a === vertexId || wall.b === vertexId)
  if (touching.length <= 1) {
    if (touching.length === 0) {
      return { ...floor, vertices: floor.vertices.filter((vertex) => vertex.id !== vertexId) }
    }
    return deleteWall(floor, touching[0].id, selection)
  }
  if (touching.length === 2) {
    const n1 = touching[0].a === vertexId ? touching[0].b : touching[0].a
    const n2 = touching[1].a === vertexId ? touching[1].b : touching[1].a
    const p1 = floor.vertices.find((vertex) => vertex.id === n1)
    const p2 = floor.vertices.find((vertex) => vertex.id === n2)
    if (!p1 || !p2 || n1 === n2) return null
    const remaining: Floor = {
      ...floor,
      vertices: floor.vertices.filter((vertex) => vertex.id !== vertexId),
      walls: floor.walls.filter((wall) => wall.id !== touching[0].id && wall.id !== touching[1].id),
      openings: floor.openings.filter(
        (opening) => opening.wallId !== touching[0].id && opening.wallId !== touching[1].id,
      ),
    }
    const duplicate = remaining.walls.some(
      (wall) => (wall.a === n1 && wall.b === n2) || (wall.a === n2 && wall.b === n1),
    )
    if (duplicate || segmentRejected(remaining, p1, p2)) return null
    const thickness = Math.max(touching[0].thickness, touching[1].thickness)
    const next = cleanup({
      ...remaining,
      walls: [...remaining.walls, { id: newId(), a: n1, b: n2, thickness }],
    })
    return syncRooms(floor, next, selection)
  }
  const remove = new Set(touching.map((wall) => wall.id))
  const next = cleanup({
    ...floor,
    vertices: floor.vertices.filter((vertex) => vertex.id !== vertexId),
    walls: floor.walls.filter((wall) => !remove.has(wall.id)),
    openings: floor.openings.filter((opening) => !remove.has(opening.wallId)),
  })
  return syncRooms(floor, next, selection)
}

export function deleteRoom(floor: Floor, roomId: string, selection: Selection | null): Floor {
  const room = floor.rooms.find((item) => item.id === roomId)
  if (!room) return floor
  const analysis = analyze(floor)
  const face = analysis.faces.find((item) => sameIds(item.vertexIds, canonicalize(room.vertexIds)))
  if (!face) return { ...floor, rooms: floor.rooms.filter((item) => item.id !== roomId) }
  const parent = analysis.parent.get(face.index) ?? null
  const remove = new Set<string>()
  for (const wall of floor.walls) {
    const sides = analysis.wallFaces.get(wall.id) ?? []
    if (!sides.includes(face.index)) continue
    const others = [...new Set(sides.filter((index) => index !== face.index))]
    if (others.length === 0 || (others.length === 1 && others[0] === parent)) remove.add(wall.id)
  }
  const next = cleanup({
    ...floor,
    walls: floor.walls.filter((wall) => !remove.has(wall.id)),
    openings: floor.openings.filter((opening) => !remove.has(opening.wallId)),
  })
  return syncRooms(floor, next, selection, [roomId])
}

export function setThickness(floor: Floor, wallId: string, thickness: number): Floor {
  const value = Math.max(MIN_THICKNESS, Math.min(MAX_THICKNESS, Math.round(thickness)))
  return {
    ...floor,
    walls: floor.walls.map((wall) => (wall.id === wallId ? { ...wall, thickness: value } : wall)),
  }
}

export function setOpeningWidth(floor: Floor, openingId: string, width: number): Floor {
  const opening = floor.openings.find((item) => item.id === openingId)
  const wall = opening && floor.walls.find((item) => item.id === opening.wallId)
  if (!opening || !wall) return floor
  const length = wallLengthOf(floor, wall)
  const nextEdge =
    floor.openings
      .filter((item) => item.wallId === wall.id && item.id !== opening.id && item.offset >= opening.offset - 1e-4)
      .sort((a, b) => a.offset - b.offset)[0]?.offset ?? length
  const value = Math.max(MIN_SPAN, Math.min(width, nextEdge - opening.offset, length - opening.offset))
  if (!(value > 0)) return floor
  return {
    ...floor,
    openings: floor.openings.map((item) => (item.id === openingId ? { ...item, width: value } : item)),
  }
}

export function addOpening(floor: Floor, wallId: string, kind: OpeningKind): Floor {
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall || wall.thickness <= 0) return floor
  const length = wallLengthOf(floor, wall)
  const placed = floor.openings.filter((opening) => opening.wallId === wallId).sort((a, b) => a.offset - b.offset)
  const gaps: { start: number; end: number }[] = []
  let cursor = 0
  for (const opening of placed) {
    if (opening.offset > cursor + 1e-6) gaps.push({ start: cursor, end: opening.offset })
    cursor = Math.max(cursor, opening.offset + opening.width)
  }
  if (length > cursor + 1e-6) gaps.push({ start: cursor, end: length })
  const usable = gaps
    .map((gap) => ({ ...gap, width: Math.min(DEFAULT_OPENING_WIDTH, gap.end - gap.start) }))
    .filter((gap) => gap.width >= MIN_SPAN)
  if (usable.length === 0) return floor
  const center = length / 2
  const holding = usable.find((gap) => center > gap.start + 1e-6 && center < gap.end - 1e-6)
  const gap = holding ?? usable.slice().sort((a, b) => {
    const da = Math.abs((a.start + a.end) / 2 - center)
    const db = Math.abs((b.start + b.end) / 2 - center)
    return da - db
  })[0]
  const width = gap.width
  const offset = Math.max(gap.start, Math.min(center - width / 2, gap.end - width))
  const opening: Opening = { id: newId(), wallId, kind, offset, width }
  return { ...floor, openings: [...floor.openings, opening] }
}

export function withVertex(floor: Floor, id: string, point: Point): Floor {
  return {
    ...floor,
    vertices: floor.vertices.map((vertex) => (vertex.id === id ? { ...vertex, x: point.x, y: point.y } : vertex)),
  }
}

export function translateVertices(floor: Floor, ids: Set<string>, delta: Point): Floor {
  return {
    ...floor,
    vertices: floor.vertices.map((vertex) =>
      ids.has(vertex.id) ? { ...vertex, x: vertex.x + delta.x, y: vertex.y + delta.y } : vertex,
    ),
  }
}

export function captureFractions(floor: Floor, wallIds: Iterable<string>): OpeningFrac[] {
  const out: OpeningFrac[] = []
  for (const wallId of wallIds) {
    const wall = floor.walls.find((item) => item.id === wallId)
    if (!wall) continue
    const length = wallLengthOf(floor, wall)
    if (length < 1e-8) continue
    for (const opening of floor.openings) {
      if (opening.wallId !== wallId) continue
      out.push({ id: opening.id, wallId, fraction: opening.offset / length, width: opening.width })
    }
  }
  return out
}

export function applyFractions(floor: Floor, fracs: OpeningFrac[]): Floor | null {
  if (fracs.length === 0) return floor
  const openings = floor.openings.map((opening) => {
    const frac = fracs.find((item) => item.id === opening.id)
    if (!frac) return opening
    const wall = floor.walls.find((item) => item.id === opening.wallId)
    if (!wall) return opening
    return { ...opening, offset: frac.fraction * wallLengthOf(floor, wall), width: frac.width }
  })
  const next = { ...floor, openings }
  const wallIds = new Set(fracs.map((item) => item.wallId))
  for (const wallId of wallIds) {
    const wall = next.walls.find((item) => item.id === wallId)
    if (!wall || wallLengthOf(next, wall) < MIN_SPAN) return null
    const ops = next.openings.filter((opening) => opening.wallId === wallId).sort((a, b) => a.offset - b.offset)
    let prev = 0
    const length = wallLengthOf(next, wall)
    for (const opening of ops) {
      if (opening.width < MIN_SPAN) return null
      if (opening.offset < prev - 1e-4) return null
      if (opening.offset + opening.width > length + 1e-4) return null
      prev = opening.offset + opening.width
    }
  }
  return next
}

export function moveOpeningTo(floor: Floor, openingId: string, cursor: Point): Floor {
  const opening = floor.openings.find((item) => item.id === openingId)
  const wall = opening && floor.walls.find((item) => item.id === opening.wallId)
  const ends = wall && wallEnds(floor, wall)
  if (!opening || !wall || !ends) return floor
  const length = dist(ends.a, ends.b)
  const proj = projectSegment(cursor, ends.a, ends.b)
  const sorted = floor.openings.filter((item) => item.wallId === wall.id).sort((a, b) => a.offset - b.offset)
  const index = sorted.findIndex((item) => item.id === openingId)
  const min = index > 0 ? sorted[index - 1].offset + sorted[index - 1].width : 0
  const max = index < sorted.length - 1 ? sorted[index + 1].offset - opening.width : length - opening.width
  const offset = Math.max(min, Math.min(max, proj.t * length - opening.width / 2))
  return { ...floor, openings: floor.openings.map((item) => (item.id === openingId ? { ...item, offset } : item)) }
}

export function raiseGhostWalls(
  floor: Floor,
  ghost: Floor,
  onlyWallId: string | null,
  selection: Selection | null,
): { floor: Floor; created: string[] } {
  let current = floor
  const created: string[] = []
  for (const wall of ghost.walls) {
    if (onlyWallId && wall.id !== onlyWallId) continue
    const ends = wallEnds(ghost, wall)
    if (!ends) continue
    const graph = addSegmentGraph(
      current,
      { x: ends.a.x, y: ends.a.y },
      { x: ends.b.x, y: ends.b.y },
      wall.thickness,
    )
    if (!graph) continue
    current = graph.floor
    created.push(graph.wallId)
  }
  if (created.length === 0) return { floor, created }
  return { floor: syncRooms(floor, current, selection), created }
}
