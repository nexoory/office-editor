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
} from '../constants'
import {
  addOpening,
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
import { analyze, sameIds } from '../geometry/faces'
import { hitMatchesSelection, hitTest, type Hit } from '../geometry/hitTest'
import { interiorPoint, pointInPolygon } from '../geometry/math'
import { add, constrainAngle, left, lerp, mul, norm, projectSegment, sub } from '../geometry/math'
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
  setObjectNote,
  setObjectStep,
  setObjectWidth,
  setOpeningKind,
  setRoomIcon,
} from '../objects/edit'
import { OBJECTS } from '../objects/catalog'
import { localToWorld, nearestOnContour, resizedFrame, worldToLocal } from '../objects/placement'
import { anchorAt, computePreview, incidentWallIds } from '../geometry/preview'
import { snapPoint, type SnapHit } from '../geometry/snap'
import { wallEnds } from '../geometry/walls'
import { pushSnap, takeSnap, type HistorySnap } from '../history'
import type { Access, Document, DoorSide, Floor, Hinge, ObjectKind, OpeningKind, Point, Selection, StairDirection, View } from '../types'

export type Gesture =
  | { type: 'pending'; button: 0 | 2; sx: number; sy: number; hit: Hit }
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
  cursor: { x: number; y: number; shift: boolean } | null
  gesture: Gesture | null
  textFocused: boolean
  wheel: { at: number; key: string } | null
  openingWheel: { openingId: string; dir: 1 | -1; step: number; at: number; pixel: boolean } | null
  paletteOpen: boolean
  placing: Placing | null
  legendFilter: ObjectKind | null
  browsing: boolean
}

export type PointerInfo = { button: number; sx: number; sy: number; shift: boolean }

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
    gesture: null,
    textFocused: false,
    wheel: null,
    openingWheel: null,
    paletteOpen: false,
    placing: null,
    legendFilter: null,
    browsing: false,
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
    gesture.type === 'move-chair')
  ) {
    next = paint(state, gesture.floor)
  }
  return { ...next, gesture: null, chain: null, axisLock: null }
}

export function switchFloor(state: EditorState, delta: number): EditorState {
  const index = state.document.floors.findIndex((floor) => floor.id === state.activeFloorId)
  const floor = state.document.floors[index + delta]
  if (!floor) return state
  return { ...abortGesture(state), activeFloorId: floor.id, selection: null, legendFilter: null, placing: null }
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

export function removeFloor(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.document.floors.length <= 1) return state
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
  if (!editing) return state
  const ghost = ghostFloor(state)
  if (!ghost) return state
  const raised = raiseGhostWalls(activeFloor(state), ghost, null, state.selection)
  if (raised.created.length === 0) return state
  return remember(state, { ...paint(state, raised.floor), chain: null, axisLock: null })
}

export function deleteSelection(state: EditorState, editing: boolean): EditorState {
  if (!editing || state.textFocused || !state.selection) return state
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

export function onWheel(
  state: EditorState,
  info: { sx: number; sy: number; deltaY: number; deltaMode: number; ctrl: boolean },
  editing: boolean,
): EditorState {
  const selection = state.selection
  const adjustable =
    editing &&
    !info.ctrl &&
    selection &&
    (selection.kind === 'wall' || selection.kind === 'opening')
  if (!adjustable) return zoomAt(state, info.sx, info.sy, info.deltaY)
  const floor = activeFloor(state)
  const dir: 1 | -1 = info.deltaY > 0 ? -1 : 1
  const key = `${selection.kind}:${selection.id}`
  if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    if (!wall) return state
    const nextFloor = setThickness(floor, wall.id, wall.thickness + dir)
    const applied = nextFloor.walls.find((item) => item.id === wall.id)
    if (!applied || applied.thickness === wall.thickness) return state
    return finishWheel(state, paint(state, nextFloor), key, WHEEL_MS)
  }
  const opening = floor.openings.find((item) => item.id === selection.id)
  if (!opening) return state
  return widenOpening(state, floor, opening.id, opening.width, dir, info.deltaY, info.deltaMode, key)
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
    state.gesture?.type === 'move-chair'
  ) {
    return { ...paint(state, state.gesture.floor), gesture: null, axisLock: null }
  }
  if (state.chain) return { ...state, chain: null, axisLock: null, gesture: null }
  return { ...state, selection: null }
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
  return next
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

export function onPointerDown(state: EditorState, info: PointerInfo, editing: boolean): EditorState {
  if (state.gesture) return state
  if (info.button !== 0 && info.button !== 2) return state
  if (info.button === 2 && !editing) return state
  const world = screenToWorld(state.view, info.sx, info.sy)
  const hit = hitTest(
    activeFloor(state),
    ghostFloor(state),
    world,
    state.view.zoom,
    editing,
    info.button === 2 ? 'right' : 'left',
  )
  return {
    ...state,
    cursor: { x: world.x, y: world.y, shift: info.shift },
    gesture: { type: 'pending', button: info.button, sx: info.sx, sy: info.sy, hit },
  }
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
  let next: EditorState = {
    ...state,
    view,
    cursor: { x: world.x, y: world.y, shift: info.shift },
    gesture: state.gesture?.type === 'pan' ? { type: 'pan', sx: info.sx, sy: info.sy } : state.gesture,
  }
  const gesture = next.gesture
  if (gesture?.type === 'pending' && passedThreshold(gesture, info.sx, info.sy)) {
    if (gesture.button === 0) {
      next = { ...next, gesture: { type: 'pan', sx: info.sx, sy: info.sy } }
    } else if (!next.chain && editing) {
      const down = screenToWorld(state.view, gesture.sx, gesture.sy)
      if (hitMatchesSelection(gesture.hit, next.selection)) next = beginMove(next, down)
      else {
        const anchor = anchorAt(activeFloor(next), ghostFloor(next), down, next.view.zoom, null)
        next = { ...next, selection: null, axisLock: anchor.lockWallId, gesture: { type: 'draw', anchor: anchor.point } }
      }
    }
  }
  if (next.gesture?.type === 'move-vertex') next = dragVertex(next, world, info.shift)
  else if (next.gesture?.type === 'move-wall') next = dragWall(next, world, info.shift)
  else if (next.gesture?.type === 'move-room') next = dragRoom(next, world, info.shift)
  else if (next.gesture?.type === 'move-opening') next = dragOpening(next, world)
  else if (next.gesture?.type === 'move-object') next = dragObject(next, world, info.shift)
  else if (next.gesture?.type === 'rotate-object') next = dragRotate(next, world, info.shift)
  else if (next.gesture?.type === 'resize-object') next = dragResize(next, world, info.shift)
  else if (next.gesture?.type === 'move-chair') next = dragChair(next, world)
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
      })
      next = { ...next, axisLock: preview.lockWallId }
    }
  }
  return next
}

function beginMove(state: EditorState, origin: Point): EditorState {
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

function dragVertex(state: EditorState, cursor: Point, shift: boolean): EditorState {
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
    allowGhost: true,
    lockWallId: state.axisLock,
    excludeVertexIds: [gesture.id],
    excludeWallIds: incidentWallIds(gesture.floor, gesture.id),
    ray,
  })
  if (snapped.snap.kind === 'wall') {
    const aligned = alignAlongWall(gesture.floor, snapped.snap, [gesture.id], state.view.zoom)
    const point = vertexMove(gesture.floor, gesture.id, aligned, gesture.fractions) ? aligned : snapped.snap.point
    if (vertexMove(gesture.floor, gesture.id, point, gesture.fractions)) desired = point
  } else if (snapped.snap.kind !== 'free') {
    const point = snapped.snap.point
    if (vertexMove(gesture.floor, gesture.id, point, gesture.fractions)) desired = point
  } else {
    const dir = shift && ray ? { x: Math.cos(ray.angle), y: Math.sin(ray.angle) } : null
    const point = alignDragPoint(gesture.floor, desired, [gesture.id], state.view.zoom, dir)
    if (vertexMove(gesture.floor, gesture.id, point, gesture.fractions)) desired = point
  }
  const t = settle((amount) => !!vertexMove(gesture.floor, gesture.id, lerp(gesture.origin, desired, amount), gesture.fractions))
  const point = lerp(gesture.origin, desired, t)
  const floor = vertexMove(gesture.floor, gesture.id, point, gesture.fractions) ?? gesture.floor
  return { ...paint(state, floor), axisLock: snapped.lockWallId }
}

function dragWall(state: EditorState, cursor: Point, shift: boolean): EditorState {
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
  delta = alignDragDelta(
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

function dragRoom(state: EditorState, cursor: Point, shift: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-room') return state
  const raw = sub(cursor, gesture.origin)
  let delta = shift ? (Math.abs(raw.x) >= Math.abs(raw.y) ? { x: raw.x, y: 0 } : { x: 0, y: raw.y }) : raw
  delta = alignDragDelta(
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

function dragObject(state: EditorState, cursor: Point, shift: boolean): EditorState {
  const gesture = state.gesture
  if (gesture?.type !== 'move-object') return state
  const delta = axisDelta(sub(cursor, gesture.origin), shift)
  const object = gesture.floor.objects.find((item) => item.id === gesture.id)
  if (!object) return state
  const at = { ...object, x: gesture.start.x + delta.x, y: gesture.start.y + delta.y }
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

/** Ручки у плашки: жест начинается сразу, без поиска точки на контуре предмета. */
export function startObjectHandle(
  state: EditorState,
  kind: 'rotate' | 'resize',
  info: PointerInfo,
  editing: boolean,
): EditorState {
  if (!editing || state.gesture || state.selection?.kind !== 'object') return state
  const origin = screenToWorld(state.view, info.sx, info.sy)
  const next = { ...state, cursor: { x: origin.x, y: origin.y, shift: info.shift } }
  return kind === 'rotate' ? beginRotate(next, origin) : beginResize(next, origin)
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
  if (!gesture) return { ...state, cursor: { ...screenToWorld(state.view, info.sx, info.sy), shift: info.shift } }
  const world = screenToWorld(state.view, info.sx, info.sy)
  if (gesture.type === 'pan') return { ...state, gesture: null, cursor: { x: world.x, y: world.y, shift: info.shift } }
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
    })
    let next: EditorState = { ...state, gesture: null, axisLock: null, cursor: { x: world.x, y: world.y, shift: info.shift } }
    if (preview.preview.valid) {
      const committed = commitSegment(state, gesture.anchor, preview.preview.end)
      if (committed) {
        next = remember(state, { ...committed.state, gesture: null, axisLock: null, selection: null, chain: null })
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
    gesture.type === 'move-chair'
  ) {
    return finishMove({ ...state, cursor: { x: world.x, y: world.y, shift: info.shift } }, gesture.history, gesture.floor)
  }
  if (gesture.type !== 'pending') return state
  if (gesture.button === 0) {
    const selection = selectionFromHit(gesture.hit, editing)
    return { ...state, gesture: null, selection }
  }
  if (!editing) return { ...state, gesture: null }
  if (state.chain) return commitChain({ ...state, gesture: null, cursor: { x: world.x, y: world.y, shift: info.shift } }, world, info.shift)
  const hit = gesture.hit
  if (hit.kind === 'ghost-wall') {
    const ghost = ghostFloor(state)
    if (!ghost) return { ...state, gesture: null }
    const raised = raiseGhostWalls(activeFloor(state), ghost, hit.id, state.selection)
    if (raised.created.length === 0) return { ...state, gesture: null }
    const next = paint(state, raised.floor)
    return remember(state, {
      ...next,
      gesture: null,
      chain: null,
      axisLock: null,
      selection: { kind: 'wall', id: raised.created[0] },
    })
  }
  if (
    (hit.kind === 'wall' && state.selection?.kind === 'wall' && state.selection.id === hit.id) ||
    (hit.kind === 'opening' && state.selection?.kind === 'opening' && state.selection.id === hit.id)
  ) {
    return { ...state, gesture: null }
  }
  const anchor = anchorAt(activeFloor(state), ghostFloor(state), world, state.view.zoom, state.axisLock)
  return {
    ...state,
    gesture: null,
    selection: null,
    chain: [anchor.point],
    axisLock: anchor.lockWallId,
    cursor: { x: world.x, y: world.y, shift: info.shift },
  }
}

function commitChain(state: EditorState, world: Point, shift: boolean): EditorState {
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
  })
  if (!preview.preview.valid) return { ...state, axisLock: preview.lockWallId }
  const committed = commitSegment(state, chain[chain.length - 1], preview.preview.end)
  if (!committed) return state
  const floor = activeFloor(committed.state)
  const startVertex = floor.vertices.find((vertex) => vertex.id === committed.startId)
  const endVertex = floor.vertices.find((vertex) => vertex.id === committed.endId)
  const points = chain.slice()
  if (startVertex) points[points.length - 1] = { x: startVertex.x, y: startVertex.y, vertexId: startVertex.id }
  if (preview.preview.closing || (endVertex && chain[0].vertexId === endVertex.id && chain.length >= 3)) {
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

export function cursorFor(state: EditorState): string {
  if (state.gesture?.type === 'pan') return 'grabbing'
  if (state.chain || state.gesture?.type === 'draw') return 'crosshair'
  if (
    state.gesture?.type === 'move-vertex' ||
    state.gesture?.type === 'move-wall' ||
    state.gesture?.type === 'move-room' ||
    state.gesture?.type === 'move-opening' ||
    state.gesture?.type === 'move-object' ||
    state.gesture?.type === 'rotate-object' ||
    state.gesture?.type === 'resize-object' ||
    state.gesture?.type === 'move-chair'
  ) {
    return 'move'
  }
  return 'default'
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

export function movePlace(state: EditorState, sx: number, sy: number): EditorState {
  const placing = state.placing
  if (!placing) return state
  const dragging = placing.dragging || Math.hypot(sx - placing.originX, sy - placing.originY) >= DRAG_THRESHOLD_PX
  const world = screenToWorld(state.view, sx, sy)
  const spec = OBJECTS[placing.kind]
  const correction = snapToAlignments(
    objectProbes({ x: world.x, y: world.y, rotation: 0, length: spec.length, width: spec.width }),
    collectAlignRefs(activeFloor(state), [], []),
    alignThreshold(state.view.zoom),
    null,
  )
  return { ...state, placing: { ...placing, x: world.x + correction.x, y: world.y + correction.y, dragging } }
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
    placing: null,
  }
}

export function setLegendFilter(state: EditorState, kind: ObjectKind | null): EditorState {
  if (kind === null || state.legendFilter === kind) return { ...state, legendFilter: null }
  return { ...state, legendFilter: kind }
}

export function centerOnRoom(state: EditorState, roomId: string, width: number, height: number): EditorState {
  const floor = activeFloor(state)
  const room = floor.rooms.find((item) => item.id === roomId)
  if (!room) return state
  const face = analyze(floor).faces.find((item) => sameIds(item.vertexIds, room.vertexIds))
  if (!face || face.outer.length === 0) return state
  let x = 0
  let y = 0
  for (const point of face.outer) {
    x += point.x
    y += point.y
  }
  const centroid = { x: x / face.outer.length, y: y / face.outer.length }
  const point = pointInPolygon(centroid, face.outer) ? centroid : interiorPoint(face.outer)
  return {
    ...state,
    view: {
      zoom: state.view.zoom,
      panX: width / 2 - point.x * state.view.zoom,
      panY: height / 2 - point.y * state.view.zoom,
    },
  }
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

