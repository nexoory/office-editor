export type Vertex = { id: string; x: number; y: number }

export type Wall = {
  id: string
  a: string
  b: string
  /** Полная толщина. Если заданы left и right, это их сумма, а ось остаётся между вершинами. */
  thickness: number
  /** Смещение влево от направления a → b. Вместе с right заменяет симметричную толщину. */
  left?: number
  /** Смещение вправо от направления a → b. */
  right?: number
  partition?: boolean
}

export type OpeningKind = 'passage' | 'window' | 'door'

export type Hinge = 'start' | 'end'

export type DoorSide = 'left' | 'right'

export type Access = 'none' | 'badge' | 'key'

export type Opening = {
  id: string
  wallId: string
  kind: OpeningKind
  offset: number
  width: number
  hinge?: Hinge
  side?: DoorSide
  access?: Access
}

export type Room = {
  id: string
  vertexIds: string[]
  name: string
  color: string | null
  /** Имя знака Font Awesome или отсутствие иконки. Старые типы читает roomIconName. */
  icon: string | null
  symbol?: string
  /** Название и знак на полу: центр и размер в сантиметрах плана. Без записи — по умолчанию. */
  title?: RoomMark
  badge?: RoomMark
}

export type RoomMark = { x: number; y: number; size: number }

export type RoomMarkPart = 'title' | 'badge'

export type ObjectKind =
  | 'stair'
  | 'table'
  | 'cooler'
  | 'microwave'
  | 'printer'
  | 'wardrobe'
  | 'toilet'
  | 'sink'
  | 'shower'
  | 'fridge'
  | 'bed'
  | 'sofa'
  | 'interest'

export type StairDirection = 'up' | 'down'

export type Chair = {
  id: string
  edge: 0 | 1 | 2 | 3
  u: number
  length: number
  width: number
}

export type PlanObject = {
  id: string
  kind: ObjectKind
  x: number
  y: number
  rotation: number
  length: number
  width: number
  color: string | null
  note: string
  tags: string[]
  step?: number
  direction?: StairDirection
  chairs?: Chair[]
  symbol?: string
  /** Своё имя только у «Прочего». Пустое и отсутствующее — одно и то же. */
  name?: string
}

export type Floor = {
  id: string
  name: string
  vertices: Vertex[]
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  objects: PlanObject[]
}

export type Document = { floors: Floor[] }

export type Selection =
  | { kind: 'vertex'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'chair'; objectId: string; chairId: string }

/**
 * Фильтр легенды. Лестницы делятся по ходу, «Прочее» — по имени.
 * Состояние вида, в документ не пишется.
 */
export type LegendFilter =
  | { type: 'object'; kind: Exclude<ObjectKind, 'stair' | 'interest'> }
  | { type: 'stair'; direction: StairDirection }
  | { type: 'interest'; key: string }
  | { type: 'access'; access: Exclude<Access, 'none'> }

export type View = { panX: number; panY: number; zoom: number }

export type Point = { x: number; y: number }
