import { roomIconName } from '../objects/icons'
import type { Floor, Point, Room, RoomMark, RoomMarkPart } from '../types'
import { analyze, sameIds, type AnalyzedFace } from './faces'
import { dist, interiorPoint, pointInPolygon, pointInRegion, projectSegment } from './math'
import { textWidth, UI_FONT } from './measureText'
import { floorShape } from './roomShape'

/** Кегль названия по умолчанию, сантиметры плана. */
const TITLE_MIN = 16
const TITLE_MAX = 48
/** Знак по умолчанию — в столько раз выше кегля, и зазор под ним. */
const BADGE_SCALE = 1.6
const BADGE_GAP = 0.3
const LINE = 1.2
export const MARK_MIN = 6
export const MARK_MAX = 600

export function titleFont(size: number): string {
  return `600 ${size}px ${UI_FONT}`
}

/** Ширина названия на плане: меряется одним кеглем и пересчитывается. */
export function titleWidth(name: string, size: number): number {
  return (textWidth(name, titleFont(100)) * size) / 100
}

export type Rect = { x0: number; y0: number; x1: number; y1: number }

export type ResolvedMarks = {
  roomId: string
  outer: Point[]
  holes: Point[][]
  name: string
  icon: string | null
  title: RoomMark | null
  badge: RoomMark | null
}

export function markRect(marks: ResolvedMarks, part: RoomMarkPart): Rect | null {
  const mark = marks[part]
  if (!mark) return null
  const halfW = part === 'title' ? titleWidth(marks.name, mark.size) / 2 : mark.size / 2
  const halfH = part === 'title' ? (mark.size * LINE) / 2 : mark.size / 2
  return { x0: mark.x - halfW, y0: mark.y - halfH, x1: mark.x + halfW, y1: mark.y + halfH }
}

/** Знак над названием по середине пола, кегль по ширине и высоте комнаты. */
function defaults(name: string, icon: string | null, outer: Point[], holes: Point[][]): { title: RoomMark | null; badge: RoomMark | null } {
  const center = labelPoint(outer, holes)
  const rings = [outer, ...holes]
  const wide = chord(center, rings, 'x')
  const tall = chord(center, rings, 'y')
  if (!name) {
    if (!icon) return { title: null, badge: null }
    const size = Math.max(TITLE_MIN * BADGE_SCALE, Math.min(TITLE_MAX * BADGE_SCALE, Math.min(wide, tall) * 0.3))
    return { title: null, badge: { x: center.x, y: center.y, size } }
  }
  const em = titleWidth(name, 1)
  const height = (icon ? BADGE_SCALE + BADGE_GAP : 0) + LINE
  const size = Math.round(Math.max(TITLE_MIN, Math.min(TITLE_MAX, (wide * 0.55) / em, (tall * 0.45) / height)))
  const top = center.y - (size * height) / 2
  const title = { x: center.x, y: top + size * (height - LINE / 2), size }
  if (!icon) return { title: { ...title, y: center.y }, badge: null }
  const badgeSize = Math.round(size * BADGE_SCALE)
  return { title, badge: { x: center.x, y: top + badgeSize / 2, size: badgeSize } }
}

/**
 * Надписи комнаты на плане: сохранённые, а где их нет или точка ушла с пола после правки
 * стен — по умолчанию.
 */
export function resolveMarks(floor: Floor, face: AnalyzedFace, room: Room): ResolvedMarks {
  const { outer, holes } = floorShape(floor, face)
  const name = room.name.trim()
  const icon = roomIconName(room)
  const fallback = defaults(name, icon, outer, holes)
  const keep = (mark: RoomMark | undefined) => (mark && pointInRegion(mark, outer, holes) ? mark : null)
  return {
    roomId: room.id,
    outer,
    holes,
    name,
    icon,
    title: name ? keep(room.title) ?? fallback.title : null,
    badge: icon ? keep(room.badge) ?? fallback.badge : null,
  }
}

export function floorMarks(floor: Floor, faces: AnalyzedFace[]): ResolvedMarks[] {
  const list: ResolvedMarks[] = []
  for (const face of faces) {
    const room = floor.rooms.find((item) => sameIds(item.vertexIds, face.vertexIds))
    if (room && (room.name.trim() || roomIconName(room))) list.push(resolveMarks(floor, face, room))
  }
  return list
}

export function marksOf(floor: Floor, roomId: string): ResolvedMarks | null {
  const room = floor.rooms.find((item) => item.id === roomId)
  if (!room) return null
  const face = analyze(floor).faces.find((item) => sameIds(item.vertexIds, room.vertexIds))
  return face ? resolveMarks(floor, face, room) : null
}

function inside(rect: Rect, point: Point, pad: number): boolean {
  return point.x >= rect.x0 - pad && point.x <= rect.x1 + pad && point.y >= rect.y0 - pad && point.y <= rect.y1 + pad
}

/** Угол рамки, за который меняется размер. */
export function markHandleAt(marks: ResolvedMarks, part: RoomMarkPart, point: Point, reach: number): Point | null {
  const rect = markRect(marks, part)
  if (!rect) return null
  const corners = [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 },
  ]
  return corners.find((corner) => dist(corner, point) <= reach) ?? null
}

export function markAt(marks: ResolvedMarks, point: Point, pad: number): RoomMarkPart | null {
  for (const part of ['badge', 'title'] as const) {
    const rect = markRect(marks, part)
    if (rect && inside(rect, point, pad)) return part
  }
  return null
}

function labelPoint(points: Point[], holes: Point[][]): Point {
  const average = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  const center = { x: average.x / points.length, y: average.y / points.length }
  if (holes.length === 0) return pointInPolygon(center, points) ? center : interiorPoint(points)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const point of points) {
    x0 = Math.min(x0, point.x)
    y0 = Math.min(y0, point.y)
    x1 = Math.max(x1, point.x)
    y1 = Math.max(y1, point.y)
  }
  let best = pointInRegion(center, points, holes) ? center : null
  let bestScore = best ? clearance(best, points, holes) : -1
  const steps = 7
  for (let row = 0; row <= steps; row++) {
    for (let column = 0; column <= steps; column++) {
      const point = { x: x0 + ((x1 - x0) * column) / steps, y: y0 + ((y1 - y0) * row) / steps }
      if (!pointInRegion(point, points, holes)) continue
      const score = clearance(point, points, holes) - dist(point, center) * 0.15
      if (score > bestScore) {
        best = point
        bestScore = score
      }
    }
  }
  return best ?? interiorPoint(points)
}

function clearance(point: Point, outer: Point[], holes: Point[][]): number {
  let gap = ringDistance(point, outer)
  for (const hole of holes) gap = Math.min(gap, ringDistance(point, hole))
  return gap
}

function ringDistance(point: Point, ring: Point[]): number {
  let gap = Infinity
  for (let index = 0; index < ring.length; index++) {
    gap = Math.min(gap, projectSegment(point, ring[index], ring[(index + 1) % ring.length]).distance)
  }
  return gap
}

/** Свободный отрезок пола через точку: по горизонтали или по вертикали, от стены до стены. */
function chord(point: Point, rings: Point[][], axis: 'x' | 'y'): number {
  const along = axis
  const across = axis === 'x' ? 'y' : 'x'
  let before = -Infinity
  let after = Infinity
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index]
      const b = ring[(index + 1) % ring.length]
      if ((a[across] > point[across]) === (b[across] > point[across])) continue
      const t = (point[across] - a[across]) / (b[across] - a[across])
      const hit = a[along] + (b[along] - a[along]) * t
      if (hit <= point[along]) before = Math.max(before, hit)
      else after = Math.min(after, hit)
    }
  }
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0
  return Math.min(point[along] - before, after - point[along]) * 2
}
