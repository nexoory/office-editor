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

function snapshotFrom(
  document: Document,
  activeFloorId: unknown,
  view: unknown,
  fallbackView: View | null,
): MapSnapshot | null {
  const resolved = readView(view) ?? fallbackView
  if (!resolved) return null
  const id =
    typeof activeFloorId === 'string' && document.floors.some((floor) => floor.id === activeFloorId)
      ? activeFloorId
      : document.floors[0].id
  return { document, activeFloorId: id, view: resolved }
}

function documentOf(value: unknown): Document | null {
  if (!value || typeof value !== 'object') return null
  const nested = (value as { document?: unknown }).document
  if (isDocument(nested)) return nested
  return isDocument(value) ? value : null
}

/** Снимок localStorage: только версия 1 и с видом. */
export function parseStoredMap(value: unknown): MapSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const stored = value as StoredMap
  if (stored.version !== 1 || !isDocument(stored.document)) return null
  return snapshotFrom(stored.document, stored.activeFloorId, stored.view, null)
}

/** Файл импорта: снимок версии 1 или чертёж без вида. Без вида остаётся текущий. */
export function parseImportedMap(value: unknown, fallbackView: View): MapSnapshot | null {
  if (!value || typeof value !== 'object') return null
  if ('version' in value && (value as { version?: unknown }).version !== 1) return null
  const document = documentOf(value)
  if (!document) return null
  const source = value as { activeFloorId?: unknown; view?: unknown }
  return snapshotFrom(document, source.activeFloorId, source.view, fallbackView)
}

export function serializeMap(snapshot: MapSnapshot): string {
  const stored: StoredMap = { version: 1, ...snapshot }
  return JSON.stringify(stored, null, 2)
}

/** Чертёж из localStorage. Битая запись не мешает открыть пустую карту. */
export function loadMap(): MapSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return parseStoredMap(JSON.parse(raw) as unknown)
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
