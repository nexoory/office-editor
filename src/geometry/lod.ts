import { LOD_DOT_ZOOM, LOD_LABEL_ZOOM, MARKER_PX, STAIR_MARKER_PX } from '../constants'
import { CATEGORY_PRIORITY, categoryOf, objectName } from '../objects/catalog'
import { theme } from '../theme'
import { accessLook, MARKER_LABEL_FONT, MARKER_LABEL_GAP, objectLook, type MarkerLevel, type MarkerLook } from '../objects/markers'
import type { Floor, LegendFilter, PlanObject, Point, Selection } from '../types'
import { add, mul, norm, sub } from './math'
import { textWidth } from './measureText'
import { wallEnds } from './walls'

/** Прямоугольник в пикселях экрана без сдвига вида: мировые координаты, умноженные на масштаб. */
export type ScreenBox = { x0: number; y0: number; x1: number; y1: number }

export type MarkerTarget = { kind: 'object'; id: string } | { kind: 'opening'; id: string }

export type PlacedMarker = {
  key: string
  target: MarkerTarget
  at: Point
  look: MarkerLook
  level: MarkerLevel
  size: number
  label: string | null
  muted: boolean
  selected: boolean
  hovered: boolean
}

const LABEL_MAX = 28
const LABEL_HEIGHT = 16
const PAD = 2

export function baseLevel(zoom: number): MarkerLevel {
  if (zoom < LOD_DOT_ZOOM) return 'dot'
  if (zoom < LOD_LABEL_ZOOM) return 'badge'
  return 'label'
}

/** Лестница получает маркер, только пока её ступени на экране уже не читаются. */
export function stairNeedsMarker(object: PlanObject, zoom: number): boolean {
  return Math.min(object.length, object.width) * zoom < STAIR_MARKER_PX
}

export function hasMarker(object: PlanObject, zoom: number): boolean {
  return object.kind !== 'stair' || stairNeedsMarker(object, zoom)
}

function objectLabel(object: PlanObject): string {
  const note = object.note.trim().split('\n')[0] ?? ''
  const text = note || objectName(object.kind)
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text
}

function overlaps(a: ScreenBox, boxes: ScreenBox[]): boolean {
  return boxes.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0)
}

function around(x: number, y: number, size: number): ScreenBox {
  const half = size / 2 + PAD
  return { x0: x - half, y0: y - half, x1: x + half, y1: y + half }
}

type Candidate = {
  key: string
  target: MarkerTarget
  at: Point
  look: MarkerLook
  size: number
  label: string | null
  muted: boolean
  selected: boolean
  hovered: boolean
  priority: number
  area: number
  door: boolean
}

/**
 * Маркеры этажа на текущем масштабе. Уровень у всех один и меняется разом; значки одного размера
 * и могут касаться друг друга. Раскладка в пикселях экрана нужна только подписям: подпись, которая
 * легла бы на значок, другую подпись или название комнаты, прячется.
 */
export function layoutMarkers(input: {
  floor: Floor
  zoom: number
  selection: Selection | null
  hover: { kind: string; id?: string } | null
  filter: LegendFilter | null
  obstacles: ScreenBox[]
}): PlacedMarker[] {
  const { floor, zoom, filter } = input
  const level = baseLevel(zoom)
  const candidates: Candidate[] = []

  for (const object of floor.objects) {
    if (!hasMarker(object, zoom)) continue
    const selected = input.selection?.kind === 'object' && input.selection.id === object.id
    candidates.push({
      key: object.id,
      target: { kind: 'object', id: object.id },
      at: { x: object.x, y: object.y },
      look: objectLook(object),
      size: MARKER_PX,
      label: objectLabel(object),
      muted: !!filter && filter !== object.kind,
      selected,
      hovered: input.hover?.kind === 'object' && input.hover.id === object.id,
      priority: CATEGORY_PRIORITY[categoryOf(object.kind)],
      area: object.length * object.width,
      door: false,
    })
  }

  for (const opening of floor.openings) {
    if (opening.kind !== 'door' || !opening.access || opening.access === 'none') continue
    const wall = floor.walls.find((item) => item.id === opening.wallId)
    const ends = wall && wall.thickness > 0 ? wallEnds(floor, wall) : null
    if (!ends) continue
    const matched = filter === opening.access
    const along = norm(sub(ends.b, ends.a))
    candidates.push({
      key: opening.id,
      target: { kind: 'opening', id: opening.id },
      at: add(ends.a, mul(along, opening.offset + opening.width / 2)),
      look: accessLook(opening.access),
      size: MARKER_PX,
      label: null,
      muted: !!filter && !matched,
      selected: input.selection?.kind === 'opening' && input.selection.id === opening.id,
      hovered: false,
      priority: 1.5,
      area: 0,
      door: true,
    })
  }

  candidates.sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) ||
      Number(a.muted) - Number(b.muted) ||
      a.priority - b.priority ||
      b.area - a.area,
  )

  const solid: ScreenBox[] = []
  const labels: ScreenBox[] = [...input.obstacles]
  const placed: PlacedMarker[] = []
  for (const item of candidates) {
    const sx = item.at.x * zoom
    const sy = item.at.y * zoom
    if (item.muted) {
      if (item.door) continue
      placed.push({ ...item, look: { ...item.look, color: theme.markerMuted }, level: 'dot', label: null })
      continue
    }
    // При фильтре легенды подходящий тип всегда значок, не точка; выбранный — так же без фильтра.
    let wanted: MarkerLevel = level
    if (wanted === 'dot' && (filter !== null || item.selected)) wanted = 'badge'
    if (item.door && wanted === 'label') wanted = 'badge'
    if (wanted === 'dot') {
      placed.push({ ...item, level: 'dot', label: null })
      continue
    }
    solid.push(around(sx, sy, item.size))
    let label: string | null = null
    if (wanted === 'label' && item.label) {
      const width = textWidth(item.label, MARKER_LABEL_FONT)
      const x0 = sx + item.size / 2 + MARKER_LABEL_GAP
      const text = { x0, y0: sy - LABEL_HEIGHT / 2, x1: x0 + width + PAD, y1: sy + LABEL_HEIGHT / 2 }
      if (!overlaps(text, solid) && !overlaps(text, labels)) {
        labels.push(text)
        label = item.label
      }
    }
    placed.push({ ...item, level: label ? 'label' : 'badge', label })
  }

  // Поздний значок мог лечь на раннюю подпись: такая подпись уступает.
  const badges = placed.filter((item) => item.level !== 'dot').map((item) => around(item.at.x * zoom, item.at.y * zoom, item.size))
  for (const item of placed) {
    if (item.level !== 'label') continue
    const sx = item.at.x * zoom + item.size / 2 + MARKER_LABEL_GAP
    const sy = item.at.y * zoom
    const width = textWidth(item.label ?? '', MARKER_LABEL_FONT)
    const own = around(item.at.x * zoom, item.at.y * zoom, item.size)
    const text = { x0: sx, y0: sy - LABEL_HEIGHT / 2, x1: sx + width, y1: sy + LABEL_HEIGHT / 2 }
    const others = badges.filter((box) => box.x0 !== own.x0 || box.y0 !== own.y0)
    if (overlaps(text, others)) {
      item.level = 'badge'
      item.label = null
    }
  }

  // Порядок рисования: приглушённые, точки, значки, выбранный сверху.
  const rank = (item: PlacedMarker) => (item.selected ? 3 : item.muted ? 0 : item.level === 'dot' ? 1 : 2)
  return placed.sort((a, b) => rank(a) - rank(b))
}
