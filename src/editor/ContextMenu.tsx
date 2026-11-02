import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { OBJECT_ORDER, objectName } from '../objects/catalog'
import { TypeMark } from '../objects/signs'
import type { Floor, ObjectKind } from '../types'
import { MenuItem } from './Inspector'
import { canSplitAt, type ContextMenuState } from './reduce'

export type ContextMenuActions = {
  onAddObject: (kind: ObjectKind) => void
  onStartWall: () => void
  onRaiseAll: () => void
  onRaiseGhost: () => void
  onRename: () => void
  onDelete: () => void
  onAddOpening: (kind: 'passage' | 'window') => void
  onSplit: () => void
  onPartition: (partition: boolean) => void
  onOpeningKind: (kind: 'passage' | 'door') => void
  onCopy: () => void
  onRotate: () => void
  onClose: () => void
}

const EDGE_PX = 8

export function ContextMenu(props: { menu: ContextMenuState; floor: Floor; hasGhost: boolean; actions: ContextMenuActions }) {
  const { menu, floor, actions } = props
  const ref = useRef<HTMLDivElement>(null)
  const [objects, setObjects] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    const stage = element?.offsetParent as HTMLElement | null
    if (!element || !stage) return
    const left = Math.max(EDGE_PX, Math.min(stage.clientWidth - element.offsetWidth - EDGE_PX, menu.sx))
    const top = Math.max(EDGE_PX, Math.min(stage.clientHeight - element.offsetHeight - EDGE_PX, menu.sy))
    element.style.left = `${left}px`
    element.style.top = `${top}px`
  })

  const hit = menu.hit
  const items: ReactNode[] = []
  if (menu.ghostWallId) items.push(<MenuItem key="raise" label="Поднять стену" onClick={actions.onRaiseGhost} />)

  if (hit.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === hit.id)
    if (wall) {
      if (wall.thickness > 0) {
        items.push(<MenuItem key="passage" label="Проход здесь" onClick={() => actions.onAddOpening('passage')} />)
        items.push(<MenuItem key="window" label="Окно здесь" onClick={() => actions.onAddOpening('window')} />)
      }
      items.push(
        <MenuItem key="split" label="Разделить здесь" disabled={!canSplitAt(floor, wall.id, menu.world)} onClick={actions.onSplit} />,
      )
      items.push(
        <MenuItem key="partition" label="Перегородка" checked={!!wall.partition} onClick={() => actions.onPartition(!wall.partition)} />,
      )
      items.push(<MenuItem key="delete" label="Удалить стену" keys="Del" danger onClick={actions.onDelete} />)
    }
  } else if (hit.kind === 'opening') {
    const opening = floor.openings.find((item) => item.id === hit.id)
    if (opening && opening.kind !== 'window') {
      const next = opening.kind === 'door' ? 'passage' : 'door'
      items.push(
        <MenuItem
          key="kind"
          label={next === 'door' ? 'Сделать дверью' : 'Сделать проходом'}
          onClick={() => actions.onOpeningKind(next)}
        />,
      )
    }
    items.push(<MenuItem key="delete" label="Удалить проём" keys="Del" danger onClick={actions.onDelete} />)
  } else if (hit.kind === 'vertex') {
    items.push(<MenuItem key="delete" label="Удалить точку" keys="Del" danger onClick={actions.onDelete} />)
  } else if (hit.kind === 'chair') {
    items.push(<MenuItem key="delete" label="Удалить кресло" keys="Del" danger onClick={actions.onDelete} />)
  } else if (hit.kind === 'object') {
    items.push(<MenuItem key="copy" label="Копировать" keys="Ctrl+D" onClick={actions.onCopy} />)
    items.push(<MenuItem key="rotate" label="Повернуть на 90°" keys="R" onClick={actions.onRotate} />)
    items.push(<MenuItem key="delete" label="Удалить" keys="Del" danger onClick={actions.onDelete} />)
  } else {
    items.push(
      <button
        key="objects"
        type="button"
        role="menuitem"
        className="menu-item"
        aria-expanded={objects}
        onClick={() => setObjects((open) => !open)}
      >
        <span>Добавить предмет</span>
        <span className="menu-chevron">{objects ? '▾' : '▸'}</span>
      </button>,
    )
    if (objects) {
      items.push(
        <div key="kinds" className="menu-kinds">
          {OBJECT_ORDER.map((kind) => (
            <button key={kind} type="button" className="menu-kind" onClick={() => actions.onAddObject(kind)}>
              <TypeMark kind={kind} box={20} />
              <span>{objectName(kind)}</span>
            </button>
          ))}
        </div>,
      )
    }
    items.push(<MenuItem key="wall" label="Начать стену отсюда" keys="W" onClick={actions.onStartWall} />)
    if (props.hasGhost) items.push(<MenuItem key="raiseAll" label="Поднять все стены" onClick={actions.onRaiseAll} />)
    if (hit.kind === 'room') {
      items.push(<div key="sep" className="menu-sep" />)
      items.push(<MenuItem key="rename" label="Переименовать" keys="Enter" onClick={actions.onRename} />)
      items.push(<MenuItem key="delete" label="Удалить помещение" keys="Del" danger onClick={actions.onDelete} />)
    }
  }

  return (
    <div
      ref={ref}
      className="menu-list context-menu"
      role="menu"
      style={{ left: menu.sx, top: menu.sy }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        actions.onClose()
      }}
    >
      {items}
    </div>
  )
}
