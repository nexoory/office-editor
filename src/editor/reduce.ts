import {
  DEFAULT_THICKNESS,
  DRAG_THRESHOLD_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  OPENING_SERIES_MS,
  OPENING_STEP_MAX,
  WHEEL_BURST_MS,
  WHEEL_MS,
  ZOOM_FACTOR,
  KEY_ZOOM,
  NUDGE_SERIES_MS,
} from '../constants'
import {
  addOpening,
  addOpeningAt,
  addSegment,
  applyFractions,
  captureFractions,
  createDocument,
  createFloor,
  deleteOpening,
  deleteRoom,
  deleteVertex,
  deleteWall,
  moveOpeningTo,
  nextFloorName,
  raiseGhostWalls,
  setOpeningWidth,
  setPartition,
  setThickness,
  setWallSide,
  setWallSplit,
  splitWallAt,
  thicknessAlongGhost,
  translateVertices,
  withVertex,
  type OpeningFrac,
  type SegmentEnd,
} from '../document'
import {
  alignThreshold,
  collectAlignRefs,
  geometryProbes,
  objectProbes,
  snapToAlignments,
  translateProbes,
} from '../geometry/align'
import { layoutOk, movedWallIds } from '../geometry/collide'
import { analyze, ringPoints, sameIds } from '../geometry/faces'
import { hitGhostWall, hitTest, selectionAnchor, type Hit } from '../geometry/hitTest'
import { dist, dot, pointInRegion } from '../geometry/math'
import { MARK_MAX, MARK_MIN, markAt, markHandleAt, marksOf, type ResolvedMarks } from '../geometry/roomMarks'
import { add, constrainAngle, left, lerp, mul, norm, projectSegment, sub } from '../geometry/math'
import { handleAt, type ObjectHandle } from '../objects/handles'
import { classifyPress, isMovableHit, type PointerInfo, type PressIntent, type Tool } from './input'
import {
  addChair,
  addObjectTag,
  deleteChair,
  deleteObject,
  duplicateObject,
  moveObjectTo,
  placeObject,
  removeObjectTag,
  resizeObject,
  rotateObject,
  setChairPlace,
  setDoorAccess,
  setDoorHinge,
  setDoorSide,
  setObjectColor,
  setObjectSymbol,
  setObjectDirection,
  setObjectLength,
  setObjectName,
  setObjectNote,
  setObjectStep,
  setObjectWidth,
  setOpeningKind,
  setRoomIcon,
  setRoomMarks,
} from '../objects/edit'
import { OBJECTS, sameLegendFilter } from '../objects/catalog'
import { localToWorld, nearestOnContour, resizedFrame, worldToLocal } from '../objects/placement'
import { anchorAt, computePreview, incidentWallIds } from '../geometry/preview'
import { snapPoint, type SnapHit } from '../geometry/snap'
import { innerIsLeft, wallEnds, wallSplit } from '../geometry/walls'
import { pushSnap, takeSnap, type HistorySnap } from '../history'
import type { MapSnapshot } from '../storage'
import type { Access, Document, DoorSide, Floor, Hinge, LegendFilter, ObjectKind, OpeningKind, Point, RoomMark, RoomMarkPart, Selection, StairDirection, View } from '../types'

export type { PointerInfo, Tool } from './input'

export type Gesture =
  | { type: 'pending'; intent: PressIntent; sx: number; sy: number; hit: Hit }
  | { type: 'pan'; sx: number; sy: number }
  | { type: 'draw'; anchor: SegmentEnd }
  | {
      type: 'move-vertex'
      id: string
      origin: Point
      floor: Floor
      fractions: OpeningFrac[]
      history: HistorySnap
    }
  | {
      type: 'move-wall'
      id: string
      origin: Point
      floor: Floor
      fractions: OpeningFrac[]
      history: HistorySnap
    }
  | {
      type: 'move-room'
      id: string
      origin: Point
      floor: Floor
      vertexIds: string[]
      fractions: OpeningFrac[]
      history: HistorySnap
    }
  | { type: 'move-opening'; id: string; floor: Floor; history: HistorySnap }
  | { type: 'move-object'; id: string; origin: Point; start: Point; floor: Floor; history: HistorySnap }
  | { type: 'rotate-object'; id: string; offset: number; floor: Floor; history: HistorySnap }
  | { type: 'resize-object'; id: string; fixed: Point; aspect: number; origin: Point; floor: Floor; history: HistorySnap }
  | { type: 'move-chair'; objectId: string; chairId: string; floor: Floor; history: HistorySnap }
  | { type: 'move-mark'; part: RoomMarkPart; marks: ResolvedMarks; origin: Point; start: Point; floor: Floor; history: HistorySnap }
  | { type: 'resize-mark'; part: RoomMarkPart; marks: ResolvedMarks; center: Point; reach: number; size: number; floor: Floor; history: HistorySnap }

export type Placing = {
  kind: ObjectKind
  originX: number
  originY: number
  x: number
  y: number
  dragging: boolean
}

export type EditorState = {
  document: Document
  activeFloorId: string
  selection: Selection | null
  view: View
  past: HistorySnap[]
  future: HistorySnap[]
  chain: SegmentEnd[] | null
  axisLock: string | null
  cursor: Cursor | null
  /** Последняя точка указателя на холсте: по ней пересчитывается превью, когда меняются модификаторы. */
  pointer: { sx: number; sy: number } | null
  gesture: Gesture | null
  textFocused: boolean
  wheel: { at: number; key: string } | null
  openingWheel: { openingId: string; dir: 1 | -1; step: number; at: number; pixel: boolean } | null
  paletteOpen: boolean
  placing: Placing | null
  legendFilter: LegendFilter | null
  browsing: boolean
  tool: Tool
  hover: Hover | null
  menu: ContextMenuState | null
  spaceHeld: boolean
  help: boolean
  /** Комната, чьё поле названия должно получить фокус; снимается, когда фокус поставлен. */
  renaming: string | null
  /** Оформление надписей комнаты: остальной план не отвечает на указатель. */
  decor: { roomId: string; part: RoomMarkPart | null } | null
  decorHover: RoomMarkPart | 'handle' | null
}

export type Cursor = { x: number; y: number; shift: boolean; alt: boolean }

export type Hover = Hit | { kind: 'handle'; handle: ObjectHandle }

export type ContextMenuState = { sx: number; sy: number; world: Point; hit: Hit; ghostWallId: string | null }

export function createEditorState(saved?: { document: Document; activeFloorId: string; view: View } | null): EditorState {
  const document = saved?.document ?? createDocument()
  const storedId = saved?.activeFloorId
  const activeFloorId =
    storedId && document.floors.some((floor) => floor.id === storedId) ? storedId : document.floors[0].id
  return {
    document,
    activeFloorId,
    selection: null,
    view: saved?.view ?? { panX: 80, panY: 72, zoom: 1 },
    past: [],
    future: [],
    chain: null,
    axisLock: null,
    cursor: null,
    pointer: null,
    gesture: null,
    textFocused: false,
    wheel: null,
    openingWheel: null,
    paletteOpen: false,
    placing: null,
    legendFilter: null,
    browsing: false,
    tool: 'select',
    hover: null,
    menu: null,
    spaceHeld: false,
    help: false,
    renaming: null,
    decor: null,
    decorHover: null,
  }
}

export function screenToWorld(view: View, sx: number, sy: number): Point {
  return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom }
}

export function activeFloor(state: EditorState): Floor {
  return state.document.floors.find((floor) => floor.id === state.activeFloorId) ?? state.document.floors[0]
}

export function ghostFloor(state: EditorState): Floor | null {
  const index = state.document.floors.findIndex((floor) => floor.id === state.activeFloorId)
  if (index <= 0) return null
  return state.document.floors[index - 1]
}

function paint(state: EditorState, floor: Floor): EditorState {
  return {
    ...state,
    document: { floors: state.document.floors.map((item) => (item.id === floor.id ? floor : item)) },
  }
}

function remember(state: EditorState, next: EditorState): EditorState {
  return {
    ...next,
    past: pushSnap(state.past, takeSnap(state.document, state.activeFloorId)),
    future: [],
    wheel: null,
  }
}

function selectionAlive(floor: Floor, selection: Selection | null): Selection | null {
  if (!selection) return null
  if (selection.kind === 'vertex') return floor.vertices.some((item) => item.id === selection.id) ? selection : null
  if (selection.kind === 'wall') return floor.walls.some((item) => item.id === selection.id) ? selection : null
  if (selection.kind === 'opening') {
    return floor.openings.some((item) => item.id === selection.id) ? selection : null
  }
  if (selection.kind === 'object') return floor.objects.some((item) => item.id === selection.id) ? selection : null
  if (selection.kind === 'chair') {
    const table = floor.objects.find((item) => item.id === selection.objectId)
    return table?.chairs?.some((item) => item.id === selection.chairId) ? selection : null
  }
  return floor.rooms.some((item) => item.id === selection.id) ? selection : null
}

function restoreSnap(state: EditorState, snap: HistorySnap): EditorState {
  const floor = snap.document.floors.find((item) => item.id === snap.activeFloorId) ?? snap.document.floors[0]
  return {
    ...state,
    document: snap.document,
    activeFloorId: floor.id,
    selection: selectionAlive(floor, state.selection),
    chain: null,
    axisLock: null,
    gesture: null,
    wheel: null,
    legendFilter: floor.id === state.activeFloorId ? state.legendFilter : null,
    decor: state.decor && floor.rooms.some((room) => room.id === state.decor?.roomId) ? state.decor : null,
  }
}

export function undo(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.textFocused || state.past.length === 0) return state
  const snap = state.past[state.past.length - 1]
  const current = takeSnap(state.document, state.activeFloorId)
  return { ...restoreSnap(state, snap), past: state.past.slice(0, -1), future: [...state.future, current] }
}

export function redo(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.textFocused || state.future.length === 0) return state
  const snap = state.future[state.future.length - 1]
  const current = takeSnap(state.document, state.activeFloorId)
  return { ...restoreSnap(state, snap), future: state.future.slice(0, -1), past: pushSnap(state.past, current) }
}

function abortGesture(state: EditorState): EditorState {
  const gesture = state.gesture
  let next = state
  if (
    gesture &&
    (gesture.type === 'move-vertex' ||
      gesture.type === 'move-wall' ||
      gesture.type === 'move-room' ||
      gesture.type === 'move-opening' ||
      gesture.type === 'move-object' ||
    gesture.type === 'rotate-object' ||
    gesture.type === 'resize-object' ||
    gesture.type === 'move-chair' ||
    gesture.type === 'move-mark' ||
    gesture.type === 'resize-mark')
  ) {
    next = paint(state, gesture.floor)
  }
  return { ...next, gesture: null, chain: null, axisLock: null }
}

export function switchFloor(state: EditorState, delta: number): EditorState {
  const index = state.document.floors.findIndex((floor) => floor.id === state.activeFloorId)
  const floor = state.document.floors[index + delta]
  if (!floor) return state
  return {
    ...abortGesture(state),
    activeFloorId: floor.id,
    selection: null,
    legendFilter: null,
    placing: null,
    menu: null,
    hover: null,
    decor: null,
    decorHover: null,
  }
}

export function addFloor(state: EditorState, editing: boolean, delta: -1 | 1): EditorState {
  if (!editing) return state
  const index = state.document.floors.findIndex((floor) => floor.id === state.activeFloorId)
  const floor = createFloor(nextFloorName(state.document.floors))
  const floors = state.document.floors.slice()
  floors.splice(delta > 0 ? index + 1 : index, 0, floor)
  const next = abortGesture({
    ...state,
    document: { floors },
    activeFloorId: floor.id,
    selection: null,
    legendFilter: null,
    placing: null,
  })
  return remember(state, next)
}

function floorIsEmpty(floor: Floor): boolean {
  return (
    floor.vertices.length === 0 &&
    floor.walls.length === 0 &&
    floor.openings.length === 0 &&
    floor.rooms.length === 0 &&
    floor.objects.length === 0
  )
}

export function removeFloor(state: EditorState, editing: boolean): EditorState {
  if (!editing) return state
  if (state.document.floors.length <= 1) {
    const floor = activeFloor(state)
    if (floorIsEmpty(floor)) return state
    const cleared: Floor = { ...floor, vertices: [], walls: [], openings: [], rooms: [], objects: [] }
    const next = abortGesture({
      ...state,
      selection: null,
      legendFilter: null,
      placing: null,
      menu: null,
      hover: null,
      decor: null,
      decorHover: null,
      renaming: null,
    })
    return remember(state, paint(next, cleared))
  }
  const index = state.document.floors.findIndex((floor) => floor.id === state.activeFloorId)
  const below = state.document.floors[index - 1]
  const above = state.document.floors[index + 1]
  const floors = state.document.floors.filter((floor) => floor.id !== state.activeFloorId)
  const next = abortGesture({
    ...state,
    document: { floors },
    activeFloorId: (below ?? above).id,
    selection: null,
    legendFilter: null,
    placing: null,
  })
  return remember(state, next)
}

export function renameFloor(state: EditorState, editing: boolean, name: string): EditorState {
  if (!editing) return state
  const floor = activeFloor(state)
  if (floor.name === name) return state
  return remember(state, paint(state, { ...floor, name }))
}

export function raiseAll(state: EditorState, editing: boolean): EditorState {
  if (!editing) return closeMenu(state)
  const ghost = ghostFloor(state)
  if (!ghost) return closeMenu(state)
  const raised = raiseGhostWalls(activeFloor(state), ghost, null, state.selection)
  if (raised.created.length === 0) return closeMenu(state)
  return remember(state, { ...paint(state, raised.floor), chain: null, axisLock: null, menu: null })
}

export function deleteSelection(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.textFocused || !state.selection || state.decor) return state
  const floor = activeFloor(state)
  const selection = state.selection
  let next: Floor | null = null
  if (selection.kind === 'opening') next = deleteOpening(floor, selection.id)
  else if (selection.kind === 'wall') next = deleteWall(floor, selection.id, selection)
  else if (selection.kind === 'room') next = deleteRoom(floor, selection.id, selection)
  else if (selection.kind === 'object') next = deleteObject(floor, selection.id)
  else if (selection.kind === 'chair') next = deleteChair(floor, selection.objectId, selection.chairId)
  else next = deleteVertex(floor, selection.id, selection)
  if (!next) return state
  return remember(state, { ...paint(state, next), selection: null, chain: null, axisLock: null, gesture: null })
}

export function setRoomName(state: EditorState, editing: boolean, roomId: string, name: string): EditorState {
  if (!editing) return state
  const floor = activeFloor(state)
  const room = floor.rooms.find((item) => item.id === roomId)
  if (!room || room.name === name) return state
  const next = {
    ...floor,
    rooms: floor.rooms.map((item) => (item.id === roomId ? { ...item, name } : item)),
  }
  return remember(state, paint(state, next))
}

export function setRoomColor(state: EditorState, editing: boolean, roomId: string, color: string | null): EditorState {
  if (!editing) return state
  const floor = activeFloor(state)
  const room = floor.rooms.find((item) => item.id === roomId)
  if (!room || room.color === color) return state
  const next = {
    ...floor,
    rooms: floor.rooms.map((item) => (item.id === roomId ? { ...item, color } : item)),
  }
  return remember(state, paint(state, next))
}

function zoomAt(state: EditorState, sx: number, sy: number, deltaY: number): EditorState {
  const factor = deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.view.zoom * factor))
  const world = screenToWorld(state.view, sx, sy)
  return {
    ...state,
    view: { zoom, panX: sx - world.x * zoom, panY: sy - world.y * zoom },
  }
}

export function onWheel(state: EditorState, info: { sx: number; sy: number; deltaY: number }): EditorState {
  if (info.deltaY === 0) return state
  return { ...zoomAt(state, info.sx, info.sy, info.deltaY), menu: null }
}

/** Колесо над полем толщины: шаг за щелчок, ряд прокрутки — один шаг истории. */
export function wheelWallThickness(state: EditorState, editing: boolean, wallId: string, deltaY: number): EditorState {
  if (!editing || deltaY === 0) return state
  const floor = activeFloor(state)
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall) return state
  const dir: 1 | -1 = deltaY > 0 ? -1 : 1
  const nextFloor = setThickness(floor, wall.id, wall.thickness + dir)
  const applied = nextFloor.walls.find((item) => item.id === wall.id)
  if (!applied || applied.thickness === wall.thickness) return state
  return finishWheel(state, paint(state, nextFloor), `wall:${wall.id}`, WHEEL_MS)
}

/** Колесо над полем ширины проёма: прежний разгон ряда. */
export function wheelOpeningWidth(
  state: EditorState,
  editing: boolean,
  openingId: string,
  deltaY: number,
  deltaMode: number,
): EditorState {
  if (!editing || deltaY === 0) return state
  const floor = activeFloor(state)
  const opening = floor.openings.find((item) => item.id === openingId)
  if (!opening) return state
  const dir: 1 | -1 = deltaY > 0 ? -1 : 1
  return widenOpening(state, floor, opening.id, opening.width, dir, deltaY, deltaMode, `opening:${opening.id}`)
}

export function changeWallThickness(state: EditorState, editing: boolean, wallId: string, thickness: number): EditorState {
  return editFloor(state, editing, (floor) => {
    const wall = floor.walls.find((item) => item.id === wallId)
    if (!wall) return null
    return setThickness(floor, wallId, thickness)
  })
}

/** Галочка «По сторонам»: одно поле толщины или два, внутрь и наружу. */
export function changeWallSplit(state: EditorState, editing: boolean, wallId: string, split: boolean): EditorState {
  return editFloor(state, editing, (floor) => {
    if (!floor.walls.some((item) => item.id === wallId)) return null
    return setWallSplit(floor, wallId, split)
  })
}

export function changeWallSide(
  state: EditorState,
  editing: boolean,
  wallId: string,
  side: 'inner' | 'outer',
  value: number,
): EditorState {
  return editFloor(state, editing, (floor) => {
    const wall = floor.walls.find((item) => item.id === wallId)
    if (!wall || !wallSplit(wall)) return null
    const leftSide = innerIsLeft(floor, wall)
    const onLeft = side === 'inner' ? leftSide : !leftSide
    return setWallSide(floor, wallId, onLeft ? 'left' : 'right', value)
  })
}

/** Колесо над полем «Внутрь» или «Наружу». */
export function wheelWallSide(
  state: EditorState,
  editing: boolean,
  wallId: string,
  side: 'inner' | 'outer',
  deltaY: number,
): EditorState {
  if (!editing || deltaY === 0) return state
  const floor = activeFloor(state)
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall || !wallSplit(wall)) return state
  const dir: 1 | -1 = deltaY > 0 ? -1 : 1
  const leftSide = innerIsLeft(floor, wall)
  const onLeft = side === 'inner' ? leftSide : !leftSide
  const current = onLeft ? wall.left! : wall.right!
  const nextFloor = setWallSide(floor, wall.id, onLeft ? 'left' : 'right', current + dir)
  const applied = nextFloor.walls.find((item) => item.id === wall.id)
  const appliedValue = applied && (onLeft ? applied.left : applied.right)
  if (appliedValue == null || appliedValue === current) return state
  return finishWheel(state, paint(state, nextFloor), `wall:${wall.id}:${side}`, WHEEL_MS)
}

export function changeOpeningWidth(state: EditorState, editing: boolean, openingId: string, width: number): EditorState {
  return editFloor(state, editing, (floor) => {
    if (!floor.openings.some((item) => item.id === openingId)) return null
    return setOpeningWidth(floor, openingId, width)
  })
}

function widenOpening(
  state: EditorState,
  floor: Floor,
  openingId: string,
  width: number,
  dir: 1 | -1,
  deltaY: number,
  deltaMode: number,
  key: string,
): EditorState {
  const now = Date.now()
  const notch = deltaMode !== 0 || Math.abs(deltaY) >= 50
  const series = state.openingWheel
  const same =
    series !== null && series.openingId === openingId && series.dir === dir && now - series.at <= OPENING_SERIES_MS
  if (!notch && series && same && series.pixel && now - series.at < WHEEL_BURST_MS) {
    return {
      ...state,
      openingWheel: { ...series, at: now },
      wheel: state.wheel?.key === key ? { at: now, key } : state.wheel,
    }
  }
  const step = series && same ? series.step : 1
  const nextFloor = setOpeningWidth(floor, openingId, width + dir * step)
  const applied = nextFloor.openings.find((item) => item.id === openingId)
  const changed = !!applied && applied.width !== width
  const tracked: EditorState = {
    ...state,
    openingWheel: {
      openingId,
      dir,
      step: changed ? Math.min(step * 2, OPENING_STEP_MAX) : step,
      at: now,
      pixel: !notch,
    },
  }
  if (!changed) return tracked
  return finishWheel(tracked, paint(tracked, nextFloor), key, OPENING_SERIES_MS)
}

function finishWheel(state: EditorState, next: EditorState, key: string, windowMs: number): EditorState {
  const now = Date.now()
  const fresh = !state.wheel || now - state.wheel.at > windowMs || state.wheel.key !== key
  const base = fresh ? remember(state, next) : { ...next, past: state.past, future: state.future }
  return { ...base, wheel: { at: now, key } }
}

export function createOpening(state: EditorState, editing: boolean, kind: OpeningKind): EditorState {
  if (!editing || state.selection?.kind !== 'wall') return state
  const floor = activeFloor(state)
  const before = new Set(floor.openings.map((opening) => opening.id))
  const nextFloor = addOpening(floor, state.selection.id, kind)
  const created = nextFloor.openings.find((opening) => !before.has(opening.id))
  if (!created) return state
  return remember(state, {
    ...paint(state, nextFloor),
    selection: { kind: 'opening', id: created.id },
  })
}

export function escape(state: EditorState): EditorState {
  if (state.textFocused) return state
  if (state.help) return { ...state, help: false }
  if (state.menu) return { ...state, menu: null }
  if (state.placing?.dragging) return { ...state, placing: null }
  if (state.placing) return { ...state, placing: null, paletteOpen: false }
  if (state.paletteOpen) return { ...state, paletteOpen: false }
  if (state.gesture?.type === 'draw') return { ...state, gesture: null, axisLock: null }
  if (
    state.gesture?.type === 'move-vertex' ||
    state.gesture?.type === 'move-wall' ||
    state.gesture?.type === 'move-room' ||
    state.gesture?.type === 'move-opening' ||
    state.gesture?.type === 'move-object' ||
    state.gesture?.type === 'rotate-object' ||
    state.gesture?.type === 'resize-object' ||
    state.gesture?.type === 'move-chair' ||
    state.gesture?.type === 'move-mark' ||
    state.gesture?.type === 'resize-mark'
  ) {
    return { ...paint(state, state.gesture.floor), gesture: null, axisLock: null }
  }
  if (state.decor) {
    return state.decor.part ? { ...state, decor: { ...state.decor, part: null } } : { ...state, decor: null, decorHover: null }
  }
  if (state.chain) return { ...state, chain: null, axisLock: null, gesture: null }
  if (state.selection) return { ...state, selection: null }
  if (state.tool !== 'select') return { ...state, tool: 'select' }
  return state
}

function passedThreshold(gesture: { sx: number; sy: number }, sx: number, sy: number): boolean {
  return Math.hypot(sx - gesture.sx, sy - gesture.sy) >= DRAG_THRESHOLD_PX
}

function vertexMove(base: Floor, id: string, point: Point, fracs: OpeningFrac[]): Floor | null {
  const moved = new Set(incidentWallIds(base, id))
  const next = applyFractions(withVertex(base, id, point), fracs)
  if (!next || !layoutOk(base, next, moved)) return null
  return next
}

function wallMove(base: Floor, id: string, delta: Point, fracs: OpeningFrac[]): Floor | null {
  const wall = base.walls.find((item) => item.id === id)
  if (!wall) return null
  const ids = new Set([wall.a, wall.b])
  const next = applyFractions(translateVertices(base, ids, delta), fracs)
  if (!next || !layoutOk(base, next, movedWallIds(base, ids))) return null
  return next
}

function roomMove(base: Floor, vertexIds: string[], delta: Point, fracs: OpeningFrac[]): Floor | null {
  const ids = new Set(vertexIds)
  const next = applyFractions(translateVertices(base, ids, delta), fracs)
  if (!next || !layoutOk(base, next, movedWallIds(base, ids))) return null
  const shift = (mark: RoomMark | undefined) => mark && { ...mark, x: mark.x + delta.x, y: mark.y + delta.y }
  return {
    ...next,
    rooms: next.rooms.map((room) =>
      sameIds(room.vertexIds, vertexIds) && (room.title || room.badge)
        ? { ...room, ...(room.title ? { title: shift(room.title) } : {}), ...(room.badge ? { badge: shift(room.badge) } : {}) }
        : room,
    ),
  }
}

function settle(valid: (t: number) => boolean): number {
  if (valid(1)) return 1
  if (!valid(0)) return 0
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (valid(mid)) lo = mid
    else hi = mid
  }
  return lo
}

function finishMove(state: EditorState, history: HistorySnap, origin: Floor): EditorState {
  const current = activeFloor(state)
  const changed = JSON.stringify(origin) !== JSON.stringify(current)
  const next = { ...state, gesture: null, axisLock: null }
  if (!changed) return next
  return { ...next, past: pushSnap(state.past, history), future: [], wheel: null }
}

function selectedObjectHandle(state: EditorState, world: Point, editing: boolean): ObjectHandle | null {
  if (!editing || state.tool !== 'select' || state.selection?.kind !== 'object') return null
  const selection = state.selection
  const object = activeFloor(state).objects.find((item) => item.id === selection.id)
  return object ? handleAt(object, world, state.view.zoom) : null
}

export function onPointerDown(state: EditorState, info: PointerInfo, editing: boolean): EditorState {
  if (state.gesture) return state
  const world = screenToWorld(state.view, info.sx, info.sy)
  const base: EditorState = {
    ...state,
    menu: null,
    pointer: { sx: info.sx, sy: info.sy },
    cursor: { x: world.x, y: world.y, shift: info.shift, alt: info.alt },
  }
  if (state.decor && editing) return decorPointerDown(base, info, world)
  if (info.button === 0) {
    const handle = state.spaceHeld ? null : selectedObjectHandle(state, world, editing)
    if (handle) return handle === 'rotate' ? beginRotate(base, world) : beginResize(base, world)
  }
  const hit = hitTest(activeFloor(state), world, state.view.zoom, editing, info.pointerType === 'touch')
  const intent = classifyPress({
    button: info.button,
    editing,
    tool: state.tool,
    spaceHeld: state.spaceHeld,
    hit,
    selection: state.selection,
  })
  if (!intent) return state
  if (intent === 'pan') return { ...base, hover: null, gesture: { type: 'pan', sx: info.sx, sy: info.sy } }
  const selection = intent === 'target' ? selectionFromHit(hit, editing) : base.selection
  return { ...base, selection, gesture: { type: 'pending', intent, sx: info.sx, sy: info.sy, hit } }
}

export function onPointerMove(state: EditorState, info: PointerInfo, editing: boolean): EditorState {
  const view = state.gesture?.type === 'pan'
    ? {
        ...state.view,
        panX: state.view.panX + (info.sx - state.gesture.sx),
        panY: state.view.panY + (info.sy - state.gesture.sy),
      }
    : state.view
  const world = screenToWorld(view, info.sx, info.sy)
  const alt = info.alt
  let next: EditorState = {
    ...state,
    view,
    pointer: { sx: info.sx, sy: info.sy },
    cursor: { x: world.x, y: world.y, shift: info.shift, alt },
    gesture: state.gesture?.type === 'pan' ? { type: 'pan', sx: info.sx, sy: info.sy } : state.gesture,
  }
  const gesture = next.gesture
  if (gesture?.type === 'pending' && passedThreshold(gesture, info.sx, info.sy)) {
    const down = screenToWorld(state.view, gesture.sx, gesture.sy)
    if (gesture.intent === 'target' && editing) {
      next = beginMove(next, down)
    } else if (gesture.intent === 'floor' || gesture.intent === 'secondary') {
      const caught = { ...view, panX: view.panX + info.sx - gesture.sx, panY: view.panY + info.sy - gesture.sy }
      next = { ...next, view: caught, menu: null, hover: null, gesture: { type: 'pan', sx: info.sx, sy: info.sy } }
    } else if (gesture.intent === 'draw' && editing && !next.chain) {
      const anchor = anchorAt(activeFloor(next), ghostFloor(next), down, next.view.zoom, null, alt)
      next = { ...next, selection: null, axisLock: anchor.lockWallId, gesture: { type: 'draw', anchor: anchor.point } }
    }
  }
  if (next.gesture?.type === 'move-vertex') next = dragVertex(next, world, info.shift, alt)
  else if (next.gesture?.type === 'move-wall') next = dragWall(next, world, info.shift, alt)
  else if (next.gesture?.type === 'move-room') next = dragRoom(next, world, info.shift, alt)
  else if (next.gesture?.type === 'move-opening') next = dragOpening(next, world)
  else if (next.gesture?.type === 'move-object') next = dragObject(next, world, info.shift, alt)
  else if (next.gesture?.type === 'rotate-object') next = dragRotate(next, world, info.shift)
  else if (next.gesture?.type === 'resize-object') next = dragResize(next, world, info.shift)
  else if (next.gesture?.type === 'move-chair') next = dragChair(next, world)
  else if (next.gesture?.type === 'move-mark') next = dragMark(next, world, info.shift)
  else if (next.gesture?.type === 'resize-mark') next = dragMarkSize(next, world)
  if (next.chain || next.gesture?.type === 'draw') {
    const anchor = next.gesture?.type === 'draw' ? next.gesture.anchor : next.chain?.[next.chain.length - 1]
    if (anchor) {
      const preview = computePreview({
        floor: activeFloor(next),
        ghost: ghostFloor(next),
        anchor,
        cursor: world,
        raw: world,
        shift: info.shift,
        zoom: next.view.zoom,
        lockWallId: next.axisLock,
        chain: next.chain,
        free: alt,
      })
      next = { ...next, axisLock: preview.lockWallId }
    }
  }
  if (!next.gesture && info.pointerType !== 'touch') {
    next = next.decor
      ? { ...next, hover: null, decorHover: decorHoverAt(next, world) }
      : { ...next, hover: keepHover(hoverAt(next, world, editing), state.hover) }
  }
  return next
}

function keepHover(next: Hover | null, previous: Hover | null): Hover | null {
  return sameHover(next, previous) ? previous : next
}

function sameHover(a: Hover | null, b: Hover | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'handle' && b.kind === 'handle') return a.handle === b.handle
  if (a.kind === 'chair' && b.kind === 'chair') return a.objectId === b.objectId && a.chairId === b.chairId
  return 'id' in a && 'id' in b && a.id === b.id
}

function hoverAt(state: EditorState, world: Point, editing: boolean): Hover | null {
  if (state.spaceHeld || state.menu || (editing && state.tool === 'wall')) return null
  const handle = selectedObjectHandle(state, world, editing)
  if (handle) return { kind: 'handle', handle }
  const hit = hitTest(activeFloor(state), world, state.view.zoom, editing)
  return hit.kind === 'empty' ? null : hit
}

export function pointerLeave(state: EditorState): EditorState {
  if (!state.hover && !state.pointer) return state
  return { ...state, hover: null, pointer: state.gesture ? state.pointer : null }
}

/** Shift и Alt нажали или отпустили без движения мыши: превью и перенос пересчитываются на месте. */
export function setModifiers(state: EditorState, shift: boolean, alt: boolean, editing: boolean): EditorState {
  const cursor = state.cursor
  if (cursor && cursor.shift === shift && cursor.alt === alt) return state
  if (!state.pointer) return cursor ? { ...state, cursor: { ...cursor, shift, alt } } : state
  return onPointerMove(state, { button: -1, sx: state.pointer.sx, sy: state.pointer.sy, shift, alt }, editing)
}

/** Второй палец или потерянный указатель: незаконченный жест откатывается, цепочка остаётся. */
export function cancelPointer(state: EditorState): EditorState {
  const gesture = state.gesture
  if (!gesture) return state
  if (gesture.type === 'pending' || gesture.type === 'pan' || gesture.type === 'draw') {
    return { ...state, gesture: null, axisLock: state.chain ? state.axisLock : null }
  }
  return { ...paint(state, gesture.floor), gesture: null, axisLock: null }
}

export function pinchView(
  state: EditorState,
  info: { sx: number; sy: number; scale: number; dx: number; dy: number },
): EditorState {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.view.zoom * info.scale))
  const world = screenToWorld(state.view, info.sx, info.sy)
  return {
    ...state,
    menu: null,
    view: { zoom, panX: info.sx + info.dx - world.x * zoom, panY: info.sy + info.dy - world.y * zoom },
  }
}

function beginMove(state: EditorState, origin: Point): EditorState {
  if (state.decor) return beginMarkMove(state, origin)
  const selection = state.selection
  const floor = activeFloor(state)
  if (!selection) return state
  const history = takeSnap(state.document, state.activeFloorId)
  if (selection.kind === 'vertex') {
    const vertex = floor.vertices.find((item) => item.id === selection.id)
    if (!vertex) return state
    const walls = incidentWallIds(floor, vertex.id)
    return {
      ...state,
      gesture: {
        type: 'move-vertex',
        id: vertex.id,
        origin: { x: vertex.x, y: vertex.y },
        floor,
        fractions: captureFractions(floor, walls),
        history,
      },
    }
  }
  if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    if (!wall) return state
    return {
      ...state,
      gesture: {
        type: 'move-wall',
        id: wall.id,
        origin,
        floor,
        fractions: captureFractions(floor, movedWallIds(floor, new Set([wall.a, wall.b]))),
        history,
      },
    }
  }
  if (selection.kind === 'room') {
    const room = floor.rooms.find((item) => item.id === selection.id)
    if (!room) return state
    return {
      ...state,
      gesture: {
        type: 'move-room',
        id: room.id,
        origin,
        floor,
        vertexIds: room.vertexIds,
        fractions: captureFractions(floor, movedWallIds(floor, new Set(room.vertexIds))),
        history,
      },
    }
  }
  if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    if (!object) return state
    return {
      ...state,
      gesture: {
        type: 'move-object',
        id: object.id,
        origin,
        start: { x: object.x, y: object.y },
        floor,
        history,
      },
    }
  }
  if (selection.kind === 'chair') {
    return {
      ...state,
      gesture: { type: 'move-chair', objectId: selection.objectId, chairId: selection.chairId, floor, history },
    }
  }
  if (selection.kind !== 'opening') return state
  return {
    ...state,
    gesture: { type: 'move-opening', id: selection.id, floor, history },
  }
}

function beginRotate(state: EditorState, origin: Point): EditorState {
  const selection = state.selection
  if (selection?.kind !== 'object') return state
  const object = activeFloor(state).objects.find((item) => item.id === selection.id)
  if (!object) return state
  const pointer = Math.atan2(origin.y - object.y, origin.x - object.x)
  return {
    ...state,
    gesture: {
      type: 'rotate-object',
      id: object.id,
      offset: object.rotation - pointer,
      floor: activeFloor(state),
      history: takeSnap(state.document, state.activeFloorId),
    },
  }
}

function dragVertex(state: EditorState, cursor: Point, shift: boolean, alt: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-vertex') return state
  let desired = shift ? constrainAngle(gesture.origin, cursor) : cursor
  const ray = shift ? { origin: gesture.origin, angle: Math.atan2(desired.y - gesture.origin.y, desired.x - gesture.origin.x) } : null
  const snapped = snapPoint({
    cursor: desired,
    raw: cursor,
    floor: gesture.floor,
    ghost: ghostFloor(state),
    zoom: state.view.zoom,
    allowGhost: !alt,
    lockWallId: alt ? null : state.axisLock,
    excludeVertexIds: [gesture.id],
    excludeWallIds: incidentWallIds(gesture.floor, gesture.id),
    ray,
  })
  if (snapped.snap.kind === 'wall') {
    const aligned = alt ? snapped.snap.point : alignAlongWall(gesture.floor, snapped.snap, [gesture.id], state.view.zoom)
    const point = vertexMove(gesture.floor, gesture.id, aligned, gesture.fractions) ? aligned : snapped.snap.point
    if (vertexMove(gesture.floor, gesture.id, point, gesture.fractions)) desired = point
  } else if (snapped.snap.kind !== 'free') {
    const point = snapped.snap.point
    if (vertexMove(gesture.floor, gesture.id, point, gesture.fractions)) desired = point
  } else if (!alt) {
    const dir = shift && ray ? { x: Math.cos(ray.angle), y: Math.sin(ray.angle) } : null
    const point = alignDragPoint(gesture.floor, desired, [gesture.id], state.view.zoom, dir)
    if (vertexMove(gesture.floor, gesture.id, point, gesture.fractions)) desired = point
  }
  const t = settle((amount) => !!vertexMove(gesture.floor, gesture.id, lerp(gesture.origin, desired, amount), gesture.fractions))
  const point = lerp(gesture.origin, desired, t)
  const floor = vertexMove(gesture.floor, gesture.id, point, gesture.fractions) ?? gesture.floor
  return { ...paint(state, floor), axisLock: snapped.lockWallId }
}

function dragWall(state: EditorState, cursor: Point, shift: boolean, alt: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-wall') return state
  const wall = gesture.floor.walls.find((item) => item.id === gesture.id)
  const ends = wall && wallEnds(gesture.floor, wall)
  if (!wall || !ends) return state
  let delta = sub(cursor, gesture.origin)
  const normal = left(norm(sub(ends.b, ends.a)))
  if (shift) {
    const amount = delta.x * normal.x + delta.y * normal.y
    delta = mul(normal, amount)
  }
  if (!alt) delta = alignDragDelta(
    gesture.floor,
    translateProbes(geometryProbes(gesture.floor, [wall.a, wall.b]), delta),
    [wall.a, wall.b],
    [],
    state.view.zoom,
    shift ? normal : null,
    delta,
    (correction) => !!wallMove(gesture.floor, gesture.id, add(delta, correction), gesture.fractions),
  )
  const t = settle((amount) => !!wallMove(gesture.floor, gesture.id, mul(delta, amount), gesture.fractions))
  const floor = wallMove(gesture.floor, gesture.id, mul(delta, t), gesture.fractions) ?? gesture.floor
  return paint(state, floor)
}

function dragRoom(state: EditorState, cursor: Point, shift: boolean, alt: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-room') return state
  const raw = sub(cursor, gesture.origin)
  let delta = shift ? (Math.abs(raw.x) >= Math.abs(raw.y) ? { x: raw.x, y: 0 } : { x: 0, y: raw.y }) : raw
  if (!alt) delta = alignDragDelta(
    gesture.floor,
    translateProbes(geometryProbes(gesture.floor, gesture.vertexIds), delta),
    gesture.vertexIds,
    [],
    state.view.zoom,
    shiftDir(delta, shift),
    delta,
    (correction) => !!roomMove(gesture.floor, gesture.vertexIds, add(delta, correction), gesture.fractions),
  )
  const t = settle((amount) => !!roomMove(gesture.floor, gesture.vertexIds, mul(delta, amount), gesture.fractions))
  const floor = roomMove(gesture.floor, gesture.vertexIds, mul(delta, t), gesture.fractions) ?? gesture.floor
  return paint(state, floor)
}

function axisDelta(raw: Point, shift: boolean): Point {
  if (!shift) return raw
  return Math.abs(raw.x) >= Math.abs(raw.y) ? { x: raw.x, y: 0 } : { x: 0, y: raw.y }
}

function shiftDir(delta: Point, shift: boolean): Point | null {
  if (!shift) return null
  return delta.x === 0 && delta.y !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 }
}

function alignDragPoint(floor: Floor, point: Point, excludeVertexIds: string[], zoom: number, dir: Point | null): Point {
  const delta = snapToAlignments([point], collectAlignRefs(floor, excludeVertexIds, []), alignThreshold(zoom), dir)
  return add(point, delta)
}

function alignAlongWall(floor: Floor, snap: Extract<SnapHit, { kind: 'wall' }>, excludeVertexIds: string[], zoom: number): Point {
  const wall = floor.walls.find((item) => item.id === snap.wallId)
  const ends = wall && wallEnds(floor, wall)
  if (!wall || !ends) return snap.point
  const delta = snapToAlignments([snap.point], collectAlignRefs(floor, excludeVertexIds, []), alignThreshold(zoom), norm(sub(ends.b, ends.a)), (correction) => {
    const next = add(snap.point, correction)
    const projected = projectSegment(next, ends.a, ends.b)
    return projected.distance <= 0.75 && projected.t > 0.002 && projected.t < 0.998
  })
  return add(snap.point, delta)
}

function alignDragDelta(
  floor: Floor,
  probes: Point[],
  excludeVertexIds: string[],
  excludeObjectIds: string[],
  zoom: number,
  dir: Point | null,
  base: Point,
  allow: (correction: Point) => boolean,
): Point {
  const correction = snapToAlignments(
    probes,
    collectAlignRefs(floor, excludeVertexIds, excludeObjectIds),
    alignThreshold(zoom),
    dir,
    allow,
  )
  return add(base, correction)
}

function dragObject(state: EditorState, cursor: Point, shift: boolean, alt: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-object') return state
  const delta = axisDelta(sub(cursor, gesture.origin), shift)
  const object = gesture.floor.objects.find((item) => item.id === gesture.id)
  if (!object) return state
  const at = { ...object, x: gesture.start.x + delta.x, y: gesture.start.y + delta.y }
  if (alt) return paint(state, moveObjectTo(gesture.floor, gesture.id, at.x, at.y))
  const correction = snapToAlignments(
    objectProbes(at),
    collectAlignRefs(gesture.floor, [], [object.id]),
    alignThreshold(state.view.zoom),
    shiftDir(delta, shift),
  )
  return paint(state, moveObjectTo(gesture.floor, gesture.id, at.x + correction.x, at.y + correction.y))
}

function beginResize(state: EditorState, origin: Point): EditorState {
  const selection = state.selection
  if (selection?.kind !== 'object') return state
  const object = activeFloor(state).objects.find((item) => item.id === selection.id)
  if (!object) return state
  return {
    ...state,
    gesture: {
      type: 'resize-object',
      id: object.id,
      fixed: localToWorld(object, { x: -object.length / 2, y: -object.width / 2 }),
      aspect: object.length / Math.max(object.width, 1),
      origin,
      floor: activeFloor(state),
      history: takeSnap(state.document, state.activeFloorId),
    },
  }
}

function dragResize(state: EditorState, cursor: Point, shift: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'resize-object') return state
  const object = gesture.floor.objects.find((item) => item.id === gesture.id)
  if (!object) return state
  const corner = localToWorld(object, { x: object.length / 2, y: object.width / 2 })
  const moved = { x: corner.x + cursor.x - gesture.origin.x, y: corner.y + cursor.y - gesture.origin.y }
  return paint(state, resizeObject(gesture.floor, gesture.id, resizedFrame(object, gesture.fixed, moved, shift, gesture.aspect)))
}

function dragRotate(state: EditorState, cursor: Point, shift: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'rotate-object') return state
  const object = gesture.floor.objects.find((item) => item.id === gesture.id)
  if (!object) return state
  let angle = Math.atan2(cursor.y - object.y, cursor.x - object.x) + gesture.offset
  if (shift) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return paint(state, rotateObject(gesture.floor, gesture.id, angle))
}

function dragChair(state: EditorState, cursor: Point): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-chair') return state
  const table = gesture.floor.objects.find((item) => item.id === gesture.objectId)
  if (!table) return state
  const place = nearestOnContour(table.length, table.width, worldToLocal(table, cursor))
  return paint(state, setChairPlace(gesture.floor, gesture.objectId, gesture.chairId, place.edge, place.u))
}

function dragOpening(state: EditorState, cursor: Point): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-opening') return state
  return paint(state, moveOpeningTo(gesture.floor, gesture.id, cursor))
}

function commitSegment(
  state: EditorState,
  start: SegmentEnd,
  end: SegmentEnd,
): { state: EditorState; startId: string; endId: string } | null {
  const floor = activeFloor(state)
  const thickness = thicknessAlongGhost(ghostFloor(state), start, end) ?? DEFAULT_THICKNESS
  const result = addSegment(floor, start, end, thickness, state.selection)
  if (!result) return null
  return { state: paint(state, result.floor), startId: result.startId, endId: result.endId }
}

export function onPointerUp(state: EditorState, info: PointerInfo, editing: boolean): EditorState {
  const gesture = state.gesture
  const world = screenToWorld(state.view, info.sx, info.sy)
  const cursor: Cursor = { x: world.x, y: world.y, shift: info.shift, alt: info.alt }
  if (!gesture) return { ...state, cursor }
  if (gesture.type === 'pan') return { ...state, gesture: null, cursor }
  if (gesture.type === 'draw') {
    const preview = computePreview({
      floor: activeFloor(state),
      ghost: ghostFloor(state),
      anchor: gesture.anchor,
      cursor: world,
      raw: world,
      shift: info.shift,
      zoom: state.view.zoom,
      lockWallId: state.axisLock,
      chain: null,
      free: info.alt,
    })
    let next: EditorState = { ...state, gesture: null, axisLock: null, cursor }
    if (preview.preview.valid) {
      const committed = commitSegment(state, gesture.anchor, preview.preview.end)
      if (committed) {
        next = remember(state, { ...committed.state, gesture: null, axisLock: null, selection: null, chain: null, cursor })
      }
    }
    return next
  }
  if (
    gesture.type === 'move-vertex' ||
    gesture.type === 'move-wall' ||
    gesture.type === 'move-room' ||
    gesture.type === 'move-opening' ||
    gesture.type === 'move-object' ||
    gesture.type === 'rotate-object' ||
    gesture.type === 'resize-object' ||
    gesture.type === 'move-chair' ||
    gesture.type === 'move-mark' ||
    gesture.type === 'resize-mark'
  ) {
    return finishMove({ ...state, cursor }, gesture.history, gesture.floor)
  }
  if (gesture.type !== 'pending') return state
  const done: EditorState = { ...state, gesture: null, cursor }
  if (state.decor) {
    const marks = decorMarks(state)
    if (gesture.intent === 'floor' && (!marks || !pointInRegion(world, marks.outer, marks.holes))) {
      return { ...done, decor: null, decorHover: null }
    }
    return done
  }
  if (gesture.intent === 'target') return done
  if (gesture.intent === 'floor') return { ...done, selection: selectionFromHit(gesture.hit, editing) }
  if (gesture.intent === 'secondary') {
    if (!editing) return done
    return {
      ...done,
      selection: selectionFromHit(gesture.hit, editing),
      hover: null,
      menu: {
        sx: info.sx,
        sy: info.sy,
        world,
        hit: gesture.hit,
        ghostWallId: hitGhostWall(activeFloor(state), ghostFloor(state), world, state.view.zoom),
      },
    }
  }
  if (!editing) return done
  if (state.chain) return commitChain(done, world, info.shift, info.alt)
  const anchor = anchorAt(activeFloor(state), ghostFloor(state), world, state.view.zoom, state.axisLock, info.alt)
  return { ...done, selection: null, chain: [anchor.point], axisLock: anchor.lockWallId }
}

function commitChain(state: EditorState, world: Point, shift: boolean, alt: boolean): EditorState {
  const chain = state.chain
  if (!chain || chain.length === 0) return state
  const preview = computePreview({
    floor: activeFloor(state),
    ghost: ghostFloor(state),
    anchor: chain[chain.length - 1],
    cursor: world,
    raw: world,
    shift,
    zoom: state.view.zoom,
    lockWallId: state.axisLock,
    chain,
    free: alt,
  })
  if (!preview.preview.valid) return { ...state, axisLock: preview.lockWallId }
  const before = activeFloor(state)
  const committed = commitSegment(state, chain[chain.length - 1], preview.preview.end)
  if (!committed) return state
  const floor = activeFloor(committed.state)
  const startVertex = floor.vertices.find((vertex) => vertex.id === committed.startId)
  const endVertex = floor.vertices.find((vertex) => vertex.id === committed.endId)
  const points = chain.slice()
  if (startVertex) points[points.length - 1] = { x: startVertex.x, y: startVertex.y, vertexId: startVertex.id }
  const enclosed = analyze(floor).faces.length > analyze(before).faces.length
  if (enclosed || preview.preview.closing || (endVertex && chain[0].vertexId === endVertex.id && chain.length >= 3)) {
    return remember(state, { ...committed.state, chain: null, axisLock: null, gesture: null, selection: null })
  }
  const endPoint: SegmentEnd = endVertex
    ? { x: endVertex.x, y: endVertex.y, vertexId: endVertex.id }
    : preview.preview.end
  return remember(state, {
    ...committed.state,
    chain: [...points, endPoint],
    axisLock: preview.lockWallId,
    gesture: null,
    selection: null,
  })
}

/** Цепочку закончили: поставленные сегменты остаются, незафиксированный исчезает. */
export function finishChain(state: EditorState): EditorState {
  if (!state.chain && state.gesture?.type !== 'draw') return state
  return { ...state, chain: null, axisLock: null, gesture: state.gesture?.type === 'draw' ? null : state.gesture }
}

export function cursorFor(state: EditorState, editing: boolean): string {
  const gesture = state.gesture
  if (gesture?.type === 'pan') return 'grabbing'
  if (state.spaceHeld) return 'grab'
  if (state.chain || gesture?.type === 'draw' || (editing && state.tool === 'wall')) return 'crosshair'
  if (gesture?.type === 'rotate-object' || gesture?.type === 'resize-object') return 'grabbing'
  if (gesture?.type === 'resize-mark') return 'nwse-resize'
  if (gesture?.type === 'move-mark') return 'move'
  if (state.decor && !gesture) return state.decorHover === 'handle' ? 'nwse-resize' : state.decorHover ? 'move' : 'default'
  if (
    gesture?.type === 'move-vertex' ||
    gesture?.type === 'move-wall' ||
    gesture?.type === 'move-room' ||
    gesture?.type === 'move-opening' ||
    gesture?.type === 'move-object' ||
    gesture?.type === 'move-chair'
  ) {
    return 'move'
  }
  const hover = state.hover
  if (!hover || gesture) return 'default'
  if (hover.kind === 'handle') return hover.handle === 'rotate' ? 'grab' : 'nwse-resize'
  if (isMovableHit(hover, state.selection, editing)) return 'move'
  return 'pointer'
}

function selectionFromHit(hit: Hit, editing: boolean): Selection | null {
  if (hit.kind === 'room') return { kind: 'room', id: hit.id }
  if (hit.kind === 'object') return { kind: 'object', id: hit.id }
  if (!editing) return null
  if (hit.kind === 'vertex' || hit.kind === 'wall' || hit.kind === 'opening') return { kind: hit.kind, id: hit.id }
  if (hit.kind === 'chair') return { kind: 'chair', objectId: hit.objectId, chairId: hit.chairId }
  return null
}

function editFloor(state: EditorState, editing: boolean, produce: (floor: Floor) => Floor | null): EditorState {
  if (!editing) return state
  const floor = activeFloor(state)
  const next = produce(floor)
  if (!next || JSON.stringify(next) === JSON.stringify(floor)) return state
  return remember(state, paint(state, next))
}

export function togglePalette(state: EditorState): EditorState {
  return { ...state, paletteOpen: !state.paletteOpen, placing: null }
}

export function beginPlace(state: EditorState, kind: ObjectKind, sx: number, sy: number): EditorState {
  const world = screenToWorld(state.view, sx, sy)
  return {
    ...state,
    placing: { kind, originX: sx, originY: sy, x: world.x, y: world.y, dragging: false },
  }
}

export function movePlace(state: EditorState, sx: number, sy: number, alt: boolean): EditorState {
  const placing = state.placing
  if (!placing) return state
  const dragging = placing.dragging || Math.hypot(sx - placing.originX, sy - placing.originY) >= DRAG_THRESHOLD_PX
  const world = screenToWorld(state.view, sx, sy)
  const spec = OBJECTS[placing.kind]
  const correction = alt
    ? { x: 0, y: 0 }
    : snapToAlignments(
        objectProbes({ x: world.x, y: world.y, rotation: 0, length: spec.length, width: spec.width }),
        collectAlignRefs(activeFloor(state), [], []),
        alignThreshold(state.view.zoom),
        null,
      )
  const cursor = state.cursor ? { ...state.cursor, alt } : state.cursor
  return { ...state, cursor, placing: { ...placing, x: world.x + correction.x, y: world.y + correction.y, dragging } }
}

export function cancelPlace(state: EditorState): EditorState {
  if (!state.placing) return state
  return { ...state, placing: null }
}

export function endPlace(
  state: EditorState,
  editing: boolean,
  overCanvas: boolean,
  width: number,
  height: number,
): EditorState {
  const placing = state.placing
  if (!placing) return state
  if (!editing) return { ...state, placing: null }
  const at = placing.dragging ? (overCanvas ? { x: placing.x, y: placing.y } : null) : screenToWorld(state.view, width / 2, height / 2)
  if (!at) return { ...state, placing: null }
  const placed = placeObject(activeFloor(state), placing.kind, at.x, at.y)
  return remember(state, {
    ...paint(state, placed.floor),
    placing: null,
    paletteOpen: false,
    selection: { kind: 'object', id: placed.id },
  })
}

export function setBrowsing(state: EditorState, browsing: boolean): EditorState {
  if (state.browsing === browsing) return state
  let selection = state.selection
  if (browsing) {
    if (selection?.kind === 'vertex' || selection?.kind === 'wall' || selection?.kind === 'opening') selection = null
    else if (selection?.kind === 'chair') selection = { kind: 'object', id: selection.objectId }
  }
  const base = browsing ? abortGesture(state) : state
  return {
    ...base,
    browsing,
    selection,
    paletteOpen: browsing ? false : state.paletteOpen,
    legendFilter: browsing ? state.legendFilter : null,
    placing: null,
    menu: null,
    hover: null,
    decor: browsing ? null : state.decor,
    decorHover: null,
  }
}

export function setLegendFilter(state: EditorState, filter: LegendFilter | null): EditorState {
  if (filter === null || sameLegendFilter(state.legendFilter, filter)) return { ...state, legendFilter: null }
  return { ...state, legendFilter: filter }
}

/** Заменяет чертёж снимком из файла и оставляет шаг в истории. */
export function importMap(state: EditorState, editing: boolean, snapshot: MapSnapshot): EditorState {
  if (!editing) return state
  const cleared = abortGesture(state)
  return remember(state, {
    ...cleared,
    document: snapshot.document,
    activeFloorId: snapshot.activeFloorId,
    view: snapshot.view,
    selection: null,
    legendFilter: null,
    placing: null,
    paletteOpen: false,
    menu: null,
    hover: null,
    decor: null,
    decorHover: null,
    renaming: null,
  })
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }

function boxOf(points: Point[]): Box | null {
  if (points.length === 0) return null
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const point of points) {
    box.minX = Math.min(box.minX, point.x)
    box.minY = Math.min(box.minY, point.y)
    box.maxX = Math.max(box.maxX, point.x)
    box.maxY = Math.max(box.maxY, point.y)
  }
  return box
}

/** Рамка ложится в экран с отступом; масштаб не поднимается выше `maxZoom`. */
function fitBox(state: EditorState, box: Box, width: number, height: number, pad: number, maxZoom: number): EditorState {
  const w = Math.max(box.maxX - box.minX, 1e-6)
  const h = Math.max(box.maxY - box.minY, 1e-6)
  const fit = Math.min((width - pad * 2) / w, (height - pad * 2) / h)
  const zoom = Math.max(MIN_ZOOM, Math.min(maxZoom, MAX_ZOOM, fit))
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return { ...state, view: { zoom, panX: width / 2 - cx * zoom, panY: height / 2 - cy * zoom } }
}

function roomPoints(floor: Floor, roomId: string): Point[] {
  const room = floor.rooms.find((item) => item.id === roomId)
  return room ? ringPoints(floor, room.vertexIds) : []
}

function floorPoints(floor: Floor): Point[] {
  return [...floor.vertices, ...floor.objects.flatMap((object) => objectProbes(object))]
}

export function fitFloor(state: EditorState, width: number, height: number): EditorState {
  const box = boxOf(floorPoints(activeFloor(state)))
  return box ? fitBox(state, box, width, height, 64, 2) : state
}

export function fitRoom(state: EditorState, roomId: string, width: number, height: number): EditorState {
  const box = boxOf(roomPoints(activeFloor(state), roomId))
  return box ? fitBox(state, box, width, height, 96, 3) : state
}

export function fitSelection(state: EditorState, width: number, height: number): EditorState {
  const selection = state.selection
  if (!selection) return fitFloor(state, width, height)
  const floor = activeFloor(state)
  let points: Point[] = []
  if (selection.kind === 'room') points = roomPoints(floor, selection.id)
  else if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    if (object) points = objectProbes(object)
  } else if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    const ends = wall && wallEnds(floor, wall)
    if (ends) points = [ends.a, ends.b]
  }
  const box = boxOf(points)
  if (box) return fitBox(state, box, width, height, 96, 3)
  const anchor = selectionAnchor(floor, selection)
  if (!anchor) return state
  const zoom = state.view.zoom
  return { ...state, view: { zoom, panX: width / 2 - anchor.x * zoom, panY: height / 2 - anchor.y * zoom } }
}

/** Клик по комнате в легенде: комната вписывается в экран и становится выбранной. */
export function showRoom(state: EditorState, roomId: string, width: number, height: number): EditorState {
  if (!activeFloor(state).rooms.some((item) => item.id === roomId)) return state
  return { ...fitRoom(state, roomId, width, height), selection: { kind: 'room', id: roomId }, menu: null }
}

export function zoomBy(state: EditorState, sx: number, sy: number, factor: number): EditorState {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.view.zoom * factor))
  const world = screenToWorld(state.view, sx, sy)
  return { ...state, menu: null, view: { zoom, panX: sx - world.x * zoom, panY: sy - world.y * zoom } }
}

export function zoomStep(state: EditorState, dir: 1 | -1, width: number, height: number): EditorState {
  return zoomBy(state, width / 2, height / 2, dir > 0 ? KEY_ZOOM : 1 / KEY_ZOOM)
}

export function panBy(state: EditorState, dx: number, dy: number): EditorState {
  return { ...state, menu: null, view: { ...state.view, panX: state.view.panX + dx, panY: state.view.panY + dy } }
}

export function onDoubleClick(state: EditorState, info: { sx: number; sy: number }, editing: boolean, width: number, height: number): EditorState {
  if (state.spaceHeld || state.decor) return state
  if (editing && state.tool === 'wall') return finishChain(state)
  const world = screenToWorld(state.view, info.sx, info.sy)
  const hit = hitTest(activeFloor(state), world, state.view.zoom, editing)
  if (hit.kind === 'room') {
    const selection: Selection = { kind: 'room', id: hit.id }
    if (editing) {
      const marks = marksOf(activeFloor(state), hit.id)
      if (marks && markAt(marks, world, 3 / state.view.zoom)) return startDecor({ ...state, selection }, editing)
      return { ...state, selection, renaming: hit.id }
    }
    return { ...fitRoom(state, hit.id, width, height), selection }
  }
  if (hit.kind === 'empty') return zoomBy(state, info.sx, info.sy, 2)
  return state
}

export function setTool(state: EditorState, tool: Tool, editing: boolean): EditorState {
  if (!editing || state.tool === tool) return state
  const base = abortGesture(state)
  return { ...base, tool, selection: tool === 'wall' ? null : base.selection, menu: null, hover: null, placing: null, decor: null }
}

export function setSpace(state: EditorState, held: boolean): EditorState {
  if (state.spaceHeld === held) return state
  return { ...state, spaceHeld: held, hover: held ? null : state.hover }
}

export function toggleHelp(state: EditorState, open?: boolean): EditorState {
  const help = open ?? !state.help
  return help === state.help ? state : { ...state, help, menu: null }
}

export function requestRename(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.selection?.kind !== 'room') return state
  return { ...state, renaming: state.selection.id, menu: null }
}

export function renameHandled(state: EditorState): EditorState {
  return state.renaming ? { ...state, renaming: null } : state
}

/** Стрелки: шаг в единицах холста. Серия нажатий без паузы — один шаг истории. */
export function nudgeSelection(state: EditorState, editing: boolean, dx: number, dy: number): EditorState {
  const selection = state.selection
  if (!editing || state.textFocused || state.gesture || !selection) return state
  if (state.decor) return nudgeMark(state, dx, dy)
  const floor = activeFloor(state)
  const delta = { x: dx, y: dy }
  let next: Floor | null = null
  if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    if (object) next = moveObjectTo(floor, object.id, object.x + dx, object.y + dy)
  } else if (selection.kind === 'vertex') {
    const vertex = floor.vertices.find((item) => item.id === selection.id)
    if (vertex) {
      const fractions = captureFractions(floor, incidentWallIds(floor, vertex.id))
      next = vertexMove(floor, vertex.id, add(vertex, delta), fractions)
    }
  } else if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    if (wall) next = wallMove(floor, wall.id, delta, captureFractions(floor, movedWallIds(floor, new Set([wall.a, wall.b]))))
  } else if (selection.kind === 'room') {
    const room = floor.rooms.find((item) => item.id === selection.id)
    if (room) {
      const fractions = captureFractions(floor, movedWallIds(floor, new Set(room.vertexIds)))
      next = roomMove(floor, room.vertexIds, delta, fractions)
    }
  } else if (selection.kind === 'opening') {
    const opening = floor.openings.find((item) => item.id === selection.id)
    const wall = opening && floor.walls.find((item) => item.id === opening.wallId)
    const ends = wall && wallEnds(floor, wall)
    if (opening && ends) {
      const along = norm(sub(ends.b, ends.a))
      const step = dot(delta, along)
      if (Math.abs(step) > 1e-6) {
        const center = add(ends.a, mul(along, opening.offset + opening.width / 2 + step))
        next = moveOpeningTo(floor, opening.id, center)
      }
    }
  }
  if (!next || JSON.stringify(next) === JSON.stringify(floor)) return state
  const key = selection.kind === 'chair' ? 'nudge' : `nudge:${selection.kind}:${selection.id}`
  return finishWheel(state, paint(state, next), key, NUDGE_SERIES_MS)
}

export function rotateSelection(state: EditorState, editing: boolean, dir: 1 | -1): EditorState {
  const selection = state.selection
  if (selection?.kind !== 'object' || state.textFocused) return state
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === selection.id)
    if (!object) return null
    return rotateObject(floor, object.id, object.rotation + (dir * Math.PI) / 2)
  })
}

export function duplicateSelection(state: EditorState, editing: boolean): EditorState {
  if (state.selection?.kind !== 'object' || state.textFocused) return state
  return { ...copyObject(state, editing, state.selection.id), menu: null }
}

export function closeMenu(state: EditorState): EditorState {
  return state.menu ? { ...state, menu: null } : state
}

export function menuAddOpening(state: EditorState, editing: boolean, kind: 'passage' | 'window'): EditorState {
  const menu = state.menu
  if (!editing || menu?.hit.kind !== 'wall') return closeMenu(state)
  const floor = activeFloor(state)
  const before = new Set(floor.openings.map((opening) => opening.id))
  const nextFloor = addOpeningAt(floor, menu.hit.id, kind, menu.world)
  const created = nextFloor.openings.find((opening) => !before.has(opening.id))
  if (!created) return closeMenu(state)
  return remember(state, { ...paint(state, nextFloor), menu: null, selection: { kind: 'opening', id: created.id } })
}

/** Ближайший конец с большим числом стен остаётся, второй поворачивается к 0°, 45°, 90°… */
export function menuAlignWall(state: EditorState, editing: boolean): EditorState {
  const menu = state.menu
  if (!editing || menu?.hit.kind !== 'wall') return closeMenu(state)
  const wallId = menu.hit.id
  const floor = activeFloor(state)
  const wall = floor.walls.find((item) => item.id === wallId)
  const ends = wall && wallEnds(floor, wall)
  if (!wall || !ends) return closeMenu(state)
  const links = (id: string) => floor.walls.filter((item) => item.a === id || item.b === id).length
  const anchorId = links(wall.b) > links(wall.a) ? wall.b : wall.a
  const movingId = anchorId === wall.a ? wall.b : wall.a
  const origin = anchorId === wall.a ? ends.a : ends.b
  const target = movingId === wall.b ? ends.b : ends.a
  const nextPoint = constrainAngle(origin, target)
  if (dist(nextPoint, target) <= 0.5) return closeMenu(state)
  const moved = vertexMove(floor, movingId, nextPoint, captureFractions(floor, incidentWallIds(floor, movingId)))
  if (!moved) return closeMenu(state)
  return remember(state, { ...paint(state, moved), menu: null, selection: { kind: 'wall', id: wall.id } })
}

export function menuSplitWall(state: EditorState, editing: boolean): EditorState {
  const menu = state.menu
  if (!editing || menu?.hit.kind !== 'wall') return closeMenu(state)
  const split = splitWallAt(activeFloor(state), menu.hit.id, menu.world, state.selection)
  if (!split) return closeMenu(state)
  return remember(state, { ...paint(state, split.floor), menu: null, selection: { kind: 'vertex', id: split.vertexId } })
}

export function menuPlaceObject(state: EditorState, editing: boolean, kind: ObjectKind): EditorState {
  const menu = state.menu
  if (!editing || !menu) return closeMenu(state)
  const placed = placeObject(activeFloor(state), kind, menu.world.x, menu.world.y)
  return remember(state, { ...paint(state, placed.floor), menu: null, selection: { kind: 'object', id: placed.id } })
}

export function menuStartWall(state: EditorState, editing: boolean): EditorState {
  const menu = state.menu
  if (!editing || !menu) return closeMenu(state)
  const anchor = anchorAt(activeFloor(state), ghostFloor(state), menu.world, state.view.zoom, null)
  return {
    ...abortGesture(state),
    tool: 'wall',
    menu: null,
    selection: null,
    chain: [anchor.point],
    axisLock: anchor.lockWallId,
  }
}

export function menuRaiseGhost(state: EditorState, editing: boolean): EditorState {
  const menu = state.menu
  const ghost = ghostFloor(state)
  if (!editing || !menu?.ghostWallId || !ghost) return closeMenu(state)
  const raised = raiseGhostWalls(activeFloor(state), ghost, menu.ghostWallId, state.selection)
  if (raised.created.length === 0) return closeMenu(state)
  return remember(state, {
    ...paint(state, raised.floor),
    menu: null,
    chain: null,
    axisLock: null,
    selection: { kind: 'wall', id: raised.created[0] },
  })
}

export function canSplitAt(floor: Floor, wallId: string, point: Point): boolean {
  return splitWallAt(floor, wallId, point, null) !== null
}
export function selectChair(state: EditorState, objectId: string, chairId: string): EditorState {
  return { ...state, selection: { kind: 'chair', objectId, chairId } }
}

export function changeRoomIcon(state: EditorState, editing: boolean, roomId: string, icon: string | null): EditorState {
  return editFloor(state, editing, (floor) => {
    const room = floor.rooms.find((item) => item.id === roomId)
    if (!room || (room.icon === icon && room.symbol === undefined)) return null
    return setRoomIcon(floor, roomId, icon)
  })
}

/** Режим оформления: название и знак выбранной комнаты двигаются и меняют размер. */
export function startDecor(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.selection?.kind !== 'room') return state
  const marks = marksOf(activeFloor(state), state.selection.id)
  if (!marks || (!marks.title && !marks.badge)) return state
  return {
    ...abortGesture(state),
    decor: { roomId: state.selection.id, part: null },
    decorHover: null,
    menu: null,
    hover: null,
    tool: 'select',
    placing: null,
    paletteOpen: false,
    renaming: null,
  }
}

export function endDecor(state: EditorState): EditorState {
  return state.decor ? { ...abortGesture(state), decor: null, decorHover: null } : state
}

export function changeMarkSize(state: EditorState, editing: boolean, part: RoomMarkPart, size: number): EditorState {
  const marks = decorMarks(state)
  const mark = marks?.[part]
  if (!marks || !mark) return state
  const next = Math.round(Math.max(MARK_MIN, Math.min(MARK_MAX, size)))
  return editFloor(state, editing, (floor) => withMark(floor, marks, part, { ...mark, size: next }))
}

export function resetMarks(state: EditorState, editing: boolean): EditorState {
  const decor = state.decor
  if (!decor) return state
  return editFloor(state, editing, (floor) => setRoomMarks(floor, decor.roomId, null))
}

function decorMarks(state: EditorState): ResolvedMarks | null {
  return state.decor ? marksOf(activeFloor(state), state.decor.roomId) : null
}

/** Правка одной надписи записывает обе: вторая больше не следует за умолчаниями. */
function withMark(floor: Floor, marks: ResolvedMarks, part: RoomMarkPart, mark: RoomMark): Floor {
  return setRoomMarks(floor, marks.roomId, {
    title: part === 'title' ? mark : marks.title,
    badge: part === 'badge' ? mark : marks.badge,
  })
}

function decorPointerDown(state: EditorState, info: PointerInfo, world: Point): EditorState {
  const decor = state.decor
  const marks = decorMarks(state)
  if (!decor || !marks) return { ...state, decor: null, decorHover: null }
  if (info.button !== 0 || state.spaceHeld) return { ...state, hover: null, gesture: { type: 'pan', sx: info.sx, sy: info.sy } }
  const touch = info.pointerType === 'touch'
  const zoom = state.view.zoom
  const empty: Hit = { kind: 'empty' }
  if (decor.part) {
    const mark = marks[decor.part]
    const corner = markHandleAt(marks, decor.part, world, (touch ? 16 : 8) / zoom)
    if (mark && corner) {
      return {
        ...state,
        gesture: {
          type: 'resize-mark',
          part: decor.part,
          marks,
          center: { x: mark.x, y: mark.y },
          reach: Math.max(dist(corner, mark), 1),
          size: mark.size,
          floor: activeFloor(state),
          history: takeSnap(state.document, state.activeFloorId),
        },
      }
    }
  }
  const part = markAt(marks, world, (touch ? 8 : 3) / zoom)
  return {
    ...state,
    decor: { ...decor, part },
    gesture: { type: 'pending', intent: part ? 'target' : 'floor', sx: info.sx, sy: info.sy, hit: empty },
  }
}

function decorHoverAt(state: EditorState, world: Point): EditorState['decorHover'] {
  const marks = decorMarks(state)
  if (!marks || state.spaceHeld) return null
  const zoom = state.view.zoom
  if (state.decor?.part && markHandleAt(marks, state.decor.part, world, 8 / zoom)) return 'handle'
  return markAt(marks, world, 3 / zoom)
}

function beginMarkMove(state: EditorState, origin: Point): EditorState {
  const part = state.decor?.part
  const marks = decorMarks(state)
  const mark = part && marks?.[part]
  if (!part || !marks || !mark) return state
  return {
    ...state,
    gesture: {
      type: 'move-mark',
      part,
      marks,
      origin,
      start: { x: mark.x, y: mark.y },
      floor: activeFloor(state),
      history: takeSnap(state.document, state.activeFloorId),
    },
  }
}

/** Середина надписи не уходит с пола комнаты; края могут выходить и обрезаются. */
function dragMark(state: EditorState, cursor: Point, shift: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-mark') return state
  const mark = gesture.marks[gesture.part]
  if (!mark) return state
  const at = add(gesture.start, axisDelta(sub(cursor, gesture.origin), shift))
  if (!pointInRegion(at, gesture.marks.outer, gesture.marks.holes)) return state
  return paint(state, withMark(gesture.floor, gesture.marks, gesture.part, { ...mark, x: Math.round(at.x), y: Math.round(at.y) }))
}

function dragMarkSize(state: EditorState, cursor: Point): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'resize-mark') return state
  const mark = gesture.marks[gesture.part]
  if (!mark) return state
  const size = Math.round(Math.max(MARK_MIN, Math.min(MARK_MAX, (gesture.size * dist(cursor, gesture.center)) / gesture.reach)))
  return paint(state, withMark(gesture.floor, gesture.marks, gesture.part, { ...mark, size }))
}

function nudgeMark(state: EditorState, dx: number, dy: number): EditorState {
  const part = state.decor?.part
  const marks = decorMarks(state)
  const mark = part && marks?.[part]
  if (!part || !marks || !mark) return state
  const at = { x: mark.x + dx, y: mark.y + dy }
  if (!pointInRegion(at, marks.outer, marks.holes)) return state
  return finishWheel(state, paint(state, withMark(activeFloor(state), marks, part, { ...mark, ...at })), `nudge:mark:${part}`, NUDGE_SERIES_MS)
}

export function changeWallPartition(state: EditorState, editing: boolean, wallId: string, partition: boolean): EditorState {
  return editFloor(state, editing, (floor) => setPartition(floor, wallId, partition, state.selection))
}

export function changeOpeningKind(state: EditorState, editing: boolean, openingId: string, kind: 'passage' | 'door'): EditorState {
  return editFloor(state, editing, (floor) => {
    const opening = floor.openings.find((item) => item.id === openingId)
    if (!opening || opening.kind === kind || opening.kind === 'window') return null
    return setOpeningKind(floor, openingId, kind)
  })
}

export function changeDoorHinge(state: EditorState, editing: boolean, openingId: string, hinge: Hinge): EditorState {
  return editFloor(state, editing, (floor) => {
    const opening = floor.openings.find((item) => item.id === openingId)
    if (!opening || opening.kind !== 'door' || opening.hinge === hinge) return null
    return setDoorHinge(floor, openingId, hinge)
  })
}

export function changeDoorSide(state: EditorState, editing: boolean, openingId: string, side: DoorSide): EditorState {
  return editFloor(state, editing, (floor) => {
    const opening = floor.openings.find((item) => item.id === openingId)
    if (!opening || opening.kind !== 'door' || opening.side === side) return null
    return setDoorSide(floor, openingId, side)
  })
}

export function changeDoorAccess(state: EditorState, editing: boolean, openingId: string, access: Access): EditorState {
  return editFloor(state, editing, (floor) => {
    const opening = floor.openings.find((item) => item.id === openingId)
    if (!opening || opening.kind !== 'door' || opening.access === access) return null
    return setDoorAccess(floor, openingId, access)
  })
}

export function changeObjectNote(state: EditorState, editing: boolean, id: string, note: string): EditorState {
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === id)
    if (!object || object.note === note) return null
    return setObjectNote(floor, id, note)
  })
}

export function changeObjectName(state: EditorState, editing: boolean, id: string, name: string): EditorState {
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === id)
    if (!object || object.kind !== 'interest' || (object.name ?? '') === name) return null
    return setObjectName(floor, id, name)
  })
}

export function changeObjectTag(state: EditorState, editing: boolean, id: string, tag: string): EditorState {
  return editFloor(state, editing, (floor) => addObjectTag(floor, id, tag))
}

export function changeObjectUntag(state: EditorState, editing: boolean, id: string, tag: string): EditorState {
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === id)
    if (!object || !object.tags.includes(tag)) return null
    return removeObjectTag(floor, id, tag)
  })
}

export function changeObjectSymbol(state: EditorState, editing: boolean, id: string, symbol: string | null): EditorState {
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === id)
    if (!object || object.kind === 'stair' || (object.symbol ?? null) === symbol) return null
    return setObjectSymbol(floor, id, symbol)
  })
}

export function copyObject(state: EditorState, editing: boolean, id: string): EditorState {
  if (!editing) return state
  const copied = duplicateObject(activeFloor(state), id)
  if (!copied) return state
  return remember(state, {
    ...paint(state, copied.floor),
    selection: { kind: 'object', id: copied.id },
  })
}

export function changeObjectColor(state: EditorState, editing: boolean, id: string, color: string | null): EditorState {
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === id)
    if (!object || object.color === color) return null
    return setObjectColor(floor, id, color)
  })
}

export function changeObjectLength(state: EditorState, editing: boolean, id: string, length: number): EditorState {
  return editFloor(state, editing, (floor) => setObjectLength(floor, id, length))
}

export function changeObjectWidth(state: EditorState, editing: boolean, id: string, width: number): EditorState {
  return editFloor(state, editing, (floor) => setObjectWidth(floor, id, width))
}

export function changeObjectStep(state: EditorState, editing: boolean, id: string, step: number): EditorState {
  return editFloor(state, editing, (floor) => setObjectStep(floor, id, step))
}

export function changeObjectDirection(state: EditorState, editing: boolean, id: string, direction: StairDirection): EditorState {
  return editFloor(state, editing, (floor) => {
    const object = floor.objects.find((item) => item.id === id)
    if (!object || object.direction === direction) return null
    return setObjectDirection(floor, id, direction)
  })
}

export function changeAddChair(state: EditorState, editing: boolean, id: string): EditorState {
  return editFloor(state, editing, (floor) => {
    if (!floor.objects.some((item) => item.id === id && item.kind === 'table')) return null
    return addChair(floor, id)
  })
}

