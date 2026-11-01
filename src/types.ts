export type Vertex = { id: string; x: number; y: number }

export type Wall = { id: string; a: string; b: string; thickness: number }

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

export type RoomIcon = 'meeting' | 'wc' | 'gym' | 'lounge' | 'dining' | 'cloakroom' | 'custom'

export type Room = {
  id: string
  vertexIds: string[]
  name: string
  color: string | null
  icon: RoomIcon | null
  symbol?: string
}

export type ObjectKind =
  | 'stair'
  | 'table'
  | 'cooler'
  | 'microwave'
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

export type View = { panX: number; panY: number; zoom: number }

export type Point = { x: number; y: number }
