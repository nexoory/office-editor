import type { Hit } from '../geometry/hitTest'
import type { Selection } from '../types'

export type Tool = 'select' | 'wall'

export type PointerInfo = {
  button: number
  sx: number
  sy: number
  shift: boolean
  alt: boolean
  pointerType?: string
}

/**
 * Что значит нажатие, пока сдвиг не прошёл порог.
 * `target` — элемент выбран сразу и поедет при протягивании.
 * `floor` — протягивание двигает холст, клик выбирает пол или снимает выбор.
 * `secondary` — правая кнопка: протягивание двигает холст, клик открывает меню.
 * `draw` — инструмент «Стена».
 */
export type PressIntent = 'target' | 'floor' | 'secondary' | 'draw'

export function classifyPress(options: {
  button: number
  editing: boolean
  tool: Tool
  spaceHeld: boolean
  hit: Hit
  selection: Selection | null
}): PressIntent | 'pan' | null {
  const { button, editing, hit } = options
  if (button === 1) return 'pan'
  if (button === 2) return 'secondary'
  if (button !== 0) return null
  if (options.spaceHeld) return 'pan'
  if (!editing) return 'floor'
  if (options.tool === 'wall') return 'draw'
  if (hit.kind === 'vertex' || hit.kind === 'wall' || hit.kind === 'opening' || hit.kind === 'object' || hit.kind === 'chair') {
    return 'target'
  }
  if (hit.kind === 'room' && options.selection?.kind === 'room' && options.selection.id === hit.id) return 'target'
  return 'floor'
}

export function isMovableHit(hit: Hit, selection: Selection | null, editing: boolean): boolean {
  if (!editing) return false
  if (hit.kind === 'vertex' || hit.kind === 'wall' || hit.kind === 'opening' || hit.kind === 'object' || hit.kind === 'chair') {
    return true
  }
  return hit.kind === 'room' && selection?.kind === 'room' && selection.id === hit.id
}
