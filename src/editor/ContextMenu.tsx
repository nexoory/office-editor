import {
  faArrowsLeftRight,
  faPaintbrush,
  faChevronDown,
  faChevronRight,
  faCopy,
  faDoorOpen,
  faDownload,
  faDrawPolygon,
  faFileImage,
  faFileImport,
  faGripLines,
  faLayerGroup,
  faPen,
  faPlus,
  faRotateRight,
  faScissors,
  faTrashCan,
  faWindowMaximize,
} from '@fortawesome/free-solid-svg-icons'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { constrainAngle, dist } from '../geometry/math'
import { wallEnds } from '../geometry/walls'
import { OBJECT_ORDER, objectName } from '../objects/catalog'
import { kindLook, MarkerIcon } from '../objects/markers'
import type { Floor, ObjectKind } from '../types'
import { Glyph } from './Glyph'
import { MenuItem, MenuSeparator } from './ui/Menu'
import { canSplitAt, type ContextMenuState } from './reduce'

export type ContextMenuActions = {
  onAddObject: (kind: ObjectKind) => void
  onStartWall: () => void
  onRaiseAll: () => void
  onRaiseGhost: () => void
  onRename: () => void
  onDecor: () => void
  onDelete: () => void
  onAddOpening: (kind: 'passage' | 'window') => void
  onSplit: () => void
  onAlign: () => void
  onPartition: (partition: boolean) => void
  onOpeningKind: (kind: 'passage' | 'door') => void
  onCopy: () => void
  onRotate: () => void
  onExport: () => void
  onExportSvg: () => void
  onImport: () => void
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
  if (menu.ghostWallId) items.push(<MenuItem key="raise" icon={faLayerGroup} label="Поднять стену" onClick={actions.onRaiseGhost} />)

  if (hit.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === hit.id)
    if (wall) {
      if (wall.thickness > 0) {
        items.push(<MenuItem key="passage" icon={faArrowsLeftRight} label="Проход здесь" onClick={() => actions.onAddOpening('passage')} />)
        items.push(<MenuItem key="window" icon={faWindowMaximize} label="Окно здесь" onClick={() => actions.onAddOpening('window')} />)
      }
      items.push(
        <MenuItem key="split" icon={faScissors} label="Разделить здесь" disabled={!canSplitAt(floor, wall.id, menu.world)} onClick={actions.onSplit} />,
      )
      const ends = wallEnds(floor, wall)
      const straight = !!ends && dist(constrainAngle(ends.a, ends.b), ends.b) <= 0.5
      items.push(<MenuItem key="align" icon={faGripLines} label="Выровнять" disabled={straight} onClick={actions.onAlign} />)
      items.push(
        <MenuItem key="partition" label="Перегородка" checked={!!wall.partition} onClick={() => actions.onPartition(!wall.partition)} />,
      )
      items.push(<MenuSeparator key="sep" />)
      items.push(<MenuItem key="delete" icon={faTrashCan} label="Удалить стену" keys="Del" danger onClick={actions.onDelete} />)
    }
  } else if (hit.kind === 'opening') {
    const opening = floor.openings.find((item) => item.id === hit.id)
    if (opening && opening.kind !== 'window') {
      const next = opening.kind === 'door' ? 'passage' : 'door'
      items.push(
        <MenuItem
          key="kind"
          icon={next === 'door' ? faDoorOpen : faArrowsLeftRight}
          label={next === 'door' ? 'Сделать дверью' : 'Сделать проходом'}
          onClick={() => actions.onOpeningKind(next)}
        />,
      )
    }
    items.push(<MenuItem key="delete" icon={faTrashCan} label="Удалить проём" keys="Del" danger onClick={actions.onDelete} />)
  } else if (hit.kind === 'vertex') {
    items.push(<MenuItem key="delete" icon={faTrashCan} label="Удалить точку" keys="Del" danger onClick={actions.onDelete} />)
  } else if (hit.kind === 'chair') {
    items.push(<MenuItem key="delete" icon={faTrashCan} label="Удалить кресло" keys="Del" danger onClick={actions.onDelete} />)
  } else if (hit.kind === 'object') {
    items.push(<MenuItem key="copy" icon={faCopy} label="Копировать" keys="Ctrl+D" onClick={actions.onCopy} />)
    items.push(<MenuItem key="rotate" icon={faRotateRight} label="Повернуть на 90°" keys="R" onClick={actions.onRotate} />)
    items.push(<MenuSeparator key="sep" />)
    items.push(<MenuItem key="delete" icon={faTrashCan} label="Удалить" keys="Del" danger onClick={actions.onDelete} />)
  } else {
    items.push(
      <MenuItem
        key="objects"
        icon={faPlus}
        label="Добавить предмет"
        expanded={objects}
        trailing={<span className="menu-chevron"><Glyph icon={objects ? faChevronDown : faChevronRight} size={10} /></span>}
        onClick={() => setObjects((open) => !open)}
      />,
    )
    if (objects) {
      items.push(
        <div key="kinds" className="menu-kinds">
          {OBJECT_ORDER.map((kind) => (
            <button key={kind} type="button" className="menu-kind" onClick={() => actions.onAddObject(kind)}>
              <MarkerIcon look={kindLook(kind)} size={18} />
              <span>{objectName(kind)}</span>
            </button>
          ))}
        </div>,
      )
    }
    items.push(<MenuItem key="wall" icon={faDrawPolygon} label="Начать стену отсюда" keys="W" onClick={actions.onStartWall} />)
    if (props.hasGhost) items.push(<MenuItem key="raiseAll" icon={faLayerGroup} label="Поднять все стены" onClick={actions.onRaiseAll} />)
    if (hit.kind === 'room') {
      items.push(<MenuSeparator key="sep" />)
      items.push(<MenuItem key="rename" icon={faPen} label="Переименовать" keys="Enter" onClick={actions.onRename} />)
      items.push(<MenuItem key="decor" icon={faPaintbrush} label="Расположить надпись" onClick={actions.onDecor} />)
      items.push(<MenuItem key="delete" icon={faTrashCan} label="Удалить помещение" keys="Del" danger onClick={actions.onDelete} />)
    }
    if (hit.kind === 'empty') {
      items.push(<MenuSeparator key="io" />)
      items.push(<MenuItem key="export" icon={faDownload} label="Экспортировать JSON" onClick={actions.onExport} />)
      items.push(<MenuItem key="export-svg" icon={faFileImage} label="Экспортировать SVG" onClick={actions.onExportSvg} />)
      items.push(<MenuItem key="import" icon={faFileImport} label="Импортировать JSON" onClick={actions.onImport} />)
    }
  }

  return (
    <div
      ref={ref}
      className="panel menu context-menu"
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
