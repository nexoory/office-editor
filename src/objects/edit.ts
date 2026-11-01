import { MIN_OBJECT_SPAN } from '../constants'
import { newId } from '../document'
import type { Access, DoorSide, Floor, Hinge, ObjectKind, PlanObject, RoomIcon, StairDirection } from '../types'
import { chairsOf, DEFAULT_CHAIR, DEFAULT_SYMBOL, OBJECTS } from './catalog'
import { findIcon } from './iconList'
import { nextChairEdge } from './placement'

function clampSpan(value: number): number {
  if (!Number.isFinite(value)) return MIN_OBJECT_SPAN
  return Math.max(MIN_OBJECT_SPAN, Math.round(value))
}

function mapObject(floor: Floor, id: string, update: (object: PlanObject) => PlanObject): Floor {
  return { ...floor, objects: floor.objects.map((object) => (object.id === id ? update(object) : object)) }
}

export function placeObject(floor: Floor, kind: ObjectKind, x: number, y: number): { floor: Floor; id: string } {
  const spec = OBJECTS[kind]
  const object: PlanObject = {
    id: newId(),
    kind,
    x,
    y,
    rotation: 0,
    length: spec.length,
    width: spec.width,
    color: null,
    note: '',
    tags: [],
  }
  if (kind === 'stair') {
    object.step = spec.step
    object.direction = spec.direction ?? 'up'
  }
  if (kind === 'table') object.chairs = []
  if (kind === 'interest') object.symbol = DEFAULT_SYMBOL
  return { floor: { ...floor, objects: [...floor.objects, object] }, id: object.id }
}

export function moveObjectTo(floor: Floor, id: string, x: number, y: number): Floor {
  return mapObject(floor, id, (object) => ({ ...object, x, y }))
}

export function rotateObject(floor: Floor, id: string, rotation: number): Floor {
  return mapObject(floor, id, (object) => ({ ...object, rotation }))
}

export function deleteObject(floor: Floor, id: string): Floor {
  return { ...floor, objects: floor.objects.filter((object) => object.id !== id) }
}

export function setObjectNote(floor: Floor, id: string, note: string): Floor {
  return mapObject(floor, id, (object) => ({ ...object, note }))
}

export function addObjectTag(floor: Floor, id: string, tag: string): Floor | null {
  const trimmed = tag.trim()
  if (!trimmed) return null
  const object = floor.objects.find((item) => item.id === id)
  if (!object || object.tags.includes(trimmed)) return null
  return mapObject(floor, id, (item) => ({ ...item, tags: [...item.tags, trimmed] }))
}

export function removeObjectTag(floor: Floor, id: string, tag: string): Floor {
  return mapObject(floor, id, (object) => ({ ...object, tags: object.tags.filter((item) => item !== tag) }))
}

export function setObjectSymbol(floor: Floor, id: string, symbol: string): Floor {
  if (!findIcon(symbol)) return floor
  return mapObject(floor, id, (object) => ({ ...object, symbol }))
}

export function setObjectColor(floor: Floor, id: string, color: string | null): Floor {
  return mapObject(floor, id, (object) => ({ ...object, color }))
}

export function setObjectLength(floor: Floor, id: string, length: number): Floor {
  return mapObject(floor, id, (object) => {
    const next = clampSpan(length)
    if (object.kind !== 'stair') return { ...object, length: next }
    const step = Math.min(Math.max(object.step ?? next, MIN_OBJECT_SPAN), next)
    return { ...object, length: next, step }
  })
}

export function setObjectWidth(floor: Floor, id: string, width: number): Floor {
  return mapObject(floor, id, (object) => ({ ...object, width: clampSpan(width) }))
}

export function setObjectStep(floor: Floor, id: string, step: number): Floor {
  return mapObject(floor, id, (object) => {
    const limit = Math.max(object.length, MIN_OBJECT_SPAN)
    return { ...object, step: Math.min(clampSpan(step), limit) }
  })
}

export function setObjectDirection(floor: Floor, id: string, direction: StairDirection): Floor {
  return mapObject(floor, id, (object) => ({ ...object, direction }))
}

export function addChair(floor: Floor, id: string): Floor {
  return mapObject(floor, id, (object) => {
    const chairs = chairsOf(object)
    return {
      ...object,
      chairs: [
        ...chairs,
        { id: newId(), edge: nextChairEdge(chairs.length), u: 0.5, length: DEFAULT_CHAIR.length, width: DEFAULT_CHAIR.width },
      ],
    }
  })
}

export function deleteChair(floor: Floor, objectId: string, chairId: string): Floor {
  return mapObject(floor, objectId, (object) => ({
    ...object,
    chairs: chairsOf(object).filter((chair) => chair.id !== chairId),
  }))
}

export function setChairPlace(floor: Floor, objectId: string, chairId: string, edge: 0 | 1 | 2 | 3, u: number): Floor {
  const next = Math.max(0, Math.min(1, u))
  return mapObject(floor, objectId, (object) => ({
    ...object,
    chairs: chairsOf(object).map((chair) => (chair.id === chairId ? { ...chair, edge, u: next } : chair)),
  }))
}

export function setChairLength(floor: Floor, objectId: string, chairId: string, length: number): Floor {
  return mapObject(floor, objectId, (object) => ({
    ...object,
    chairs: chairsOf(object).map((chair) => (chair.id === chairId ? { ...chair, length: clampSpan(length) } : chair)),
  }))
}

export function setChairWidth(floor: Floor, objectId: string, chairId: string, width: number): Floor {
  return mapObject(floor, objectId, (object) => ({
    ...object,
    chairs: chairsOf(object).map((chair) => (chair.id === chairId ? { ...chair, width: clampSpan(width) } : chair)),
  }))
}

export function setOpeningKind(floor: Floor, id: string, kind: 'passage' | 'door'): Floor {
  return {
    ...floor,
    openings: floor.openings.map((opening) => {
      if (opening.id !== id || opening.kind === 'window') return opening
      if (kind === 'passage') return { ...opening, kind }
      return {
        ...opening,
        kind: 'door',
        hinge: opening.hinge ?? 'start',
        side: opening.side ?? 'left',
        access: opening.access ?? 'none',
      }
    }),
  }
}

export function setDoorHinge(floor: Floor, id: string, hinge: Hinge): Floor {
  return {
    ...floor,
    openings: floor.openings.map((opening) => (opening.id === id && opening.kind === 'door' ? { ...opening, hinge } : opening)),
  }
}

export function setDoorSide(floor: Floor, id: string, side: DoorSide): Floor {
  return {
    ...floor,
    openings: floor.openings.map((opening) => (opening.id === id && opening.kind === 'door' ? { ...opening, side } : opening)),
  }
}

export function setDoorAccess(floor: Floor, id: string, access: Access): Floor {
  return {
    ...floor,
    openings: floor.openings.map((opening) => (opening.id === id && opening.kind === 'door' ? { ...opening, access } : opening)),
  }
}

export function setRoomIcon(floor: Floor, id: string, icon: RoomIcon | null): Floor {
  return {
    ...floor,
    rooms: floor.rooms.map((room) => {
      if (room.id !== id) return room
      if (icon === 'custom') return { ...room, icon, symbol: room.symbol ?? DEFAULT_SYMBOL }
      return { ...room, icon }
    }),
  }
}

export function setRoomSymbol(floor: Floor, id: string, symbol: string): Floor {
  if (!findIcon(symbol)) return floor
  return {
    ...floor,
    rooms: floor.rooms.map((room) => (room.id === id ? { ...room, symbol } : room)),
  }
}
