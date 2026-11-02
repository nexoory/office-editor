import { MAX_ZOOM, MIN_ZOOM } from './constants'
import type { Document, Floor, View } from './types'

const KEY = 'chesta.map'

export type MapSnapshot = {
  document: Document
  activeFloorId: string
  view: View
}

type StoredMap = MapSnapshot & { version: 1 }

function isFloor(value: unknown): value is Floor {
  if (!value || typeof value !== 'object') return false
  const floor = value as Floor
  return (
    typeof floor.id === 'string' &&
    typeof floor.name === 'string' &&
    Array.isArray(floor.vertices) &&
    Array.isArray(floor.walls) &&
    Array.isArray(floor.openings) &&
    Array.isArray(floor.rooms) &&
    Array.isArray(floor.objects)
  )
}

function isDocument(value: unknown): value is Document {
  if (!value || typeof value !== 'object') return false
  const floors = (value as Document).floors
  return Array.isArray(floors) && floors.length > 0 && floors.every(isFloor)
}

function readView(value: unknown): View | null {
  if (!value || typeof value !== 'object') return null
  const view = value as View
  if (![view.panX, view.panY, view.zoom].every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  return { panX: view.panX, panY: view.panY, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom)) }
}

/** Чертёж из localStorage. Битая запись не мешает открыть пустую карту. */
export function loadMap(): MapSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredMap
    if (stored?.version !== 1 || !isDocument(stored.document)) return null
    const view = readView(stored.view)
    if (!view) return null
    const activeFloorId = stored.document.floors.some((floor) => floor.id === stored.activeFloorId)
      ? stored.activeFloorId
      : stored.document.floors[0].id
    return { document: stored.document, activeFloorId, view }
  } catch {
    return null
  }
}

export function saveMap(snapshot: MapSnapshot): void {
  try {
    const stored: StoredMap = { version: 1, ...snapshot }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // Квота или закрытое хранилище: чертёж остаётся в памяти вкладки.
  }
}
