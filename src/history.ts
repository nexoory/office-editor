import { HISTORY_LIMIT } from './constants'
import type { Document } from './types'

export type HistorySnap = {
  document: Document
  activeFloorId: string
}

export function takeSnap(document: Document, activeFloorId: string): HistorySnap {
  return structuredClone({ document, activeFloorId })
}

export function pushSnap(past: HistorySnap[], snap: HistorySnap): HistorySnap[] {
  const next = [...past, snap]
  if (next.length > HISTORY_LIMIT) next.shift()
  return next
}
