export type Vertex = { id: string; x: number; y: number }

export type Wall = { id: string; a: string; b: string; thickness: number }

export type OpeningKind = 'passage' | 'window'

export type Opening = {
  id: string
  wallId: string
  kind: OpeningKind
  offset: number
  width: number
}

export type Room = {
  id: string
  vertexIds: string[]
  name: string
  color: string | null
}

export type Floor = {
  id: string
  name: string
  vertices: Vertex[]
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
}

export type Document = { floors: Floor[] }

export type Selection =
  | { kind: 'vertex'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'room'; id: string }

export type View = { panX: number; panY: number; zoom: number }

export type Point = { x: number; y: number }
