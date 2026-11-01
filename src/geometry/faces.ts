import type { Floor, Point } from '../types'
import { dist, interiorPoint, pointInPolygon, polygonArea, signedArea } from './math'

export type AnalyzedFace = {
  index: number
  vertexIds: string[]
  holeIds: string[][]
  outer: Point[]
  holes: Point[][]
  area: number
  wallIds: string[]
}

export type Analysis = {
  faces: AnalyzedFace[]
  wallFaces: Map<string, number[]>
  parent: Map<number, number | null>
}

type Cycle = { verts: string[]; walls: string[]; area: number }

function vertexMap(floor: Floor) {
  return new Map(floor.vertices.map((v) => [v.id, v]))
}

function walkCycles(floor: Floor): Cycle[] {
  const pos = vertexMap(floor)
  const adj = new Map<string, { to: string; wallId: string; angle: number }[]>()
  for (const vertex of floor.vertices) adj.set(vertex.id, [])
  for (const wall of floor.walls) {
    const a = pos.get(wall.a)
    const b = pos.get(wall.b)
    if (!a || !b || dist(a, b) < 1e-8) continue
    adj.get(wall.a)?.push({
      to: wall.b,
      wallId: wall.id,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    })
    adj.get(wall.b)?.push({
      to: wall.a,
      wallId: wall.id,
      angle: Math.atan2(a.y - b.y, a.x - b.x),
    })
  }
  for (const list of adj.values()) {
    list.sort((p, q) => p.angle - q.angle || p.wallId.localeCompare(q.wallId))
  }

  const used = new Set<string>()
  const cycles: Cycle[] = []
  for (const wall of floor.walls) {
    for (const [startU, startV] of [
      [wall.a, wall.b],
      [wall.b, wall.a],
    ] as const) {
      if (used.has(`${startU}->${startV}`)) continue
      const verts: string[] = []
      const walls: string[] = []
      let u = startU
      let v = startV
      let guard = floor.walls.length * 4 + 8
      let closed = false
      while (guard-- > 0) {
        used.add(`${u}->${v}`)
        verts.push(u)
        const edge = (adj.get(u) ?? []).find((item) => item.to === v)
        walls.push(edge?.wallId ?? '')
        const at = adj.get(v) ?? []
        const idx = at.findIndex((item) => item.to === u)
        if (idx < 0) break
        const next = at[(idx - 1 + at.length) % at.length]
        if (v === startU && next.to === startV) {
          closed = true
          break
        }
        u = v
        v = next.to
      }
      if (!closed || verts.length < 3) continue
      const points: Point[] = []
      let complete = true
      for (const id of verts) {
        const vertex = pos.get(id)
        if (!vertex) {
          complete = false
          break
        }
        points.push({ x: vertex.x, y: vertex.y })
      }
      if (!complete || points.length !== verts.length) continue
      cycles.push({ verts, walls, area: signedArea(points) })
    }
  }
  return cycles
}

export function withoutSpikes(ids: string[]): string[] {
  const out = ids.slice()
  let guard = out.length + 2
  while (guard-- > 0) {
    let removed = false
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length]
      const next = out[(i + 1) % out.length]
      if (prev === next && out.length > 3) {
        out.splice(i, 1)
        removed = true
        break
      }
    }
    if (!removed) break
  }
  const compact: string[] = []
  for (const id of out) {
    if (compact[compact.length - 1] !== id) compact.push(id)
  }
  if (compact.length > 1 && compact[0] === compact[compact.length - 1]) compact.pop()
  return compact
}

export function canonicalize(ids: string[]): string[] {
  if (ids.length === 0) return []
  let min = 0
  for (let i = 1; i < ids.length; i++) if (ids[i] < ids[min]) min = i
  return [...ids.slice(min), ...ids.slice(0, min)]
}

export function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function ringPoints(floor: Floor, ids: string[]): Point[] {
  const pos = vertexMap(floor)
  const points: Point[] = []
  for (const id of ids) {
    const vertex = pos.get(id)
    if (!vertex) return []
    points.push({ x: vertex.x, y: vertex.y })
  }
  return points
}

export function analyze(floor: Floor): Analysis {
  const bounded = walkCycles(floor).filter((cycle) => cycle.area > 1e-4)
  const wallFaces = new Map<string, number[]>()
  const drafts = bounded.map((cycle, index) => {
    for (const wallId of cycle.walls) {
      if (!wallId) continue
      const list = wallFaces.get(wallId) ?? []
      if (!list.includes(index)) list.push(index)
      wallFaces.set(wallId, list)
    }
    const cleaned = withoutSpikes(cycle.verts)
    const vertexIds = canonicalize(cleaned.length >= 3 ? cleaned : cycle.verts)
    const outer = ringPoints(floor, vertexIds)
    return { index, vertexIds, outer, wallIds: cycle.walls.filter(Boolean) }
  })

  const parent = new Map<number, number | null>()
  for (const face of drafts) {
    const probe = face.outer.length >= 3 ? interiorPoint(face.outer) : null
    let best: number | null = null
    let bestArea = Infinity
    if (probe) {
      for (const other of drafts) {
        if (other.index === face.index || other.outer.length < 3) continue
        const area = Math.abs(signedArea(other.outer))
        if (area <= Math.abs(signedArea(face.outer)) + 1e-4) continue
        if (pointInPolygon(probe, other.outer) && area < bestArea) {
          best = other.index
          bestArea = area
        }
      }
    }
    parent.set(face.index, best)
  }

  const faces: AnalyzedFace[] = drafts.map((face) => {
    const holeIds = drafts
      .filter((other) => parent.get(other.index) === face.index)
      .map((other) => other.vertexIds)
    const holes = holeIds
      .map((ids) => ringPoints(floor, ids))
      .filter((ring) => ring.length >= 3)
    const outerArea = polygonArea(face.outer)
    const holeArea = holes.reduce((sum, ring) => sum + polygonArea(ring), 0)
    return {
      index: face.index,
      vertexIds: face.vertexIds,
      holeIds,
      outer: face.outer,
      holes,
      area: Math.max(0, outerArea - holeArea),
      wallIds: face.wallIds,
    }
  })

  return { faces: faces.filter((face) => face.vertexIds.length >= 3 && face.area > 1e-4), wallFaces, parent }
}
