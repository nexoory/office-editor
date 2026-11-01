import { useEffect, useRef, useState } from 'react'
import { formatSize } from '../geometry/formatLength'
import { selectionAnchor } from '../geometry/hitTest'
import { IconPicker } from './IconPicker'
import { ROOM_TYPES } from '../objects/icons'
import { theme } from '../theme'
import type { Access, DoorSide, Floor, Hinge, RoomIcon, Selection, View } from '../types'

export function SelectionHud(props: {
  floor: Floor
  selection: Selection
  view: View
  editing: boolean
  onDelete: () => void
  onOpening: (kind: 'passage' | 'window') => void
  onRename: (name: string) => void
  onColor: (color: string) => void
  onTextFocus: (focused: boolean) => void
  onIcon: (icon: RoomIcon | null) => void
  onSymbol: (symbol: string) => void
  onOpeningKind: (kind: 'passage' | 'door') => void
  onHinge: (hinge: Hinge) => void
  onSide: (side: DoorSide) => void
  onAccess: (access: Access) => void
}) {
  const anchor = selectionAnchor(props.floor, props.selection)
  if (!anchor || !props.editing) return null
  const left = anchor.x * props.view.zoom + props.view.panX
  const top = anchor.y * props.view.zoom + props.view.panY
  return (
    <div className="hud" style={{ left, top, transform: 'translate(-50%, 12px)' }}>
      {props.selection.kind === 'wall' && (
        <WallHud floor={props.floor} id={props.selection.id} onOpening={props.onOpening} />
      )}
      {props.selection.kind === 'opening' && (
        <OpeningHud
          floor={props.floor}
          id={props.selection.id}
          onKind={props.onOpeningKind}
          onHinge={props.onHinge}
          onSide={props.onSide}
          onAccess={props.onAccess}
        />
      )}
      {props.selection.kind === 'room' && (
        <RoomHud
          floor={props.floor}
          id={props.selection.id}
          onRename={props.onRename}
          onColor={props.onColor}
          onTextFocus={props.onTextFocus}
          onIcon={props.onIcon}
          onSymbol={props.onSymbol}
        />
      )}
      <button type="button" className="icon-button" aria-label="Удалить" onClick={props.onDelete}>
        ×
      </button>
    </div>
  )
}

function WallHud(props: { floor: Floor; id: string; onOpening: (kind: 'passage' | 'window') => void }) {
  const wall = props.floor.walls.find((item) => item.id === props.id)
  if (!wall) return null
  return (
    <>
      <span className="hud-value">{formatSize(wall.thickness)}</span>
      {wall.thickness > 0 && (
        <>
          <button type="button" onClick={() => props.onOpening('passage')}>
            Проход
          </button>
          <button type="button" onClick={() => props.onOpening('window')}>
            Окно
          </button>
        </>
      )}
    </>
  )
}

function OpeningHud(props: {
  floor: Floor
  id: string
  onKind: (kind: 'passage' | 'door') => void
  onHinge: (hinge: Hinge) => void
  onSide: (side: DoorSide) => void
  onAccess: (access: Access) => void
}) {
  const opening = props.floor.openings.find((item) => item.id === props.id)
  if (!opening) return null
  const hinge = opening.hinge ?? 'start'
  const side = opening.side ?? 'left'
  const access = opening.access ?? 'none'
  return (
    <>
      <span className="hud-value">{formatSize(opening.width)}</span>
      {opening.kind !== 'window' && (
        <div className="seg" aria-label="Тип проёма">
          <button type="button" aria-pressed={opening.kind === 'passage'} onClick={() => props.onKind('passage')}>
            Проход
          </button>
          <button type="button" aria-pressed={opening.kind === 'door'} onClick={() => props.onKind('door')}>
            Дверь
          </button>
        </div>
      )}
      {opening.kind === 'door' && (
        <>
          <div className="seg" aria-label="Петля">
            <button type="button" aria-label="Петля у начала" aria-pressed={hinge === 'start'} onClick={() => props.onHinge('start')}>
              <LeafThumb hinge="start" side={side} />
            </button>
            <button type="button" aria-label="Петля у конца" aria-pressed={hinge === 'end'} onClick={() => props.onHinge('end')}>
              <LeafThumb hinge="end" side={side} />
            </button>
          </div>
          <div className="seg" aria-label="Сторона">
            <button type="button" aria-label="Створка влево" aria-pressed={side === 'left'} onClick={() => props.onSide('left')}>
              <LeafThumb hinge={hinge} side="left" />
            </button>
            <button type="button" aria-label="Створка вправо" aria-pressed={side === 'right'} onClick={() => props.onSide('right')}>
              <LeafThumb hinge={hinge} side="right" />
            </button>
          </div>
          <div className="seg" aria-label="Доступ">
            <button type="button" aria-pressed={access === 'none'} onClick={() => props.onAccess('none')}>
              Не закрыта
            </button>
            <button type="button" aria-pressed={access === 'badge'} onClick={() => props.onAccess('badge')}>
              Пропуск
            </button>
            <button type="button" aria-pressed={access === 'key'} onClick={() => props.onAccess('key')}>
              Ключ
            </button>
          </div>
        </>
      )}
    </>
  )
}

function LeafThumb(props: { hinge: Hinge; side: DoorSide }) {
  const hingeX = props.hinge === 'start' ? 5 : 23
  const tipX = props.hinge === 'start' ? 18 : 10
  const tipY = props.side === 'left' ? 5 : 23
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
      <line x1={3} y1={14} x2={25} y2={14} stroke="currentColor" strokeWidth={2} />
      <line x1={hingeX} y1={14} x2={tipX} y2={tipY} stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

function RoomHud(props: {
  floor: Floor
  id: string
  onRename: (name: string) => void
  onColor: (color: string) => void
  onTextFocus: (focused: boolean) => void
  onIcon: (icon: RoomIcon | null) => void
  onSymbol: (symbol: string) => void
}) {
  const room = props.floor.rooms.find((item) => item.id === props.id)
  const [draft, setDraft] = useState(room?.name ?? '')
  const revert = useRef(false)
  useEffect(() => setDraft(room?.name ?? ''), [props.id, room?.name])
  if (!room) return null
  const commit = () => {
    if (draft !== room.name) props.onRename(draft)
  }
  return (
    <>
      <input
        aria-label="Название помещения"
        value={draft}
        placeholder="Без названия"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => props.onTextFocus(true)}
        onBlur={() => {
          props.onTextFocus(false)
          if (revert.current) {
            revert.current = false
            setDraft(room.name)
            return
          }
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            revert.current = true
            event.currentTarget.blur()
          }
        }}
      />
      <select
        aria-label="Тип помещения"
        value={room.icon ?? ''}
        onChange={(event) => {
          const next = ROOM_TYPES.find((type) => type.id === event.target.value)
          props.onIcon(next ? next.id : null)
        }}
      >
        <option value="">Без иконки</option>
        {ROOM_TYPES.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
      <div className="swatches">
        {theme.swatches.map((color) => (
          <button
            key={color}
            type="button"
            className={room.color === color ? 'swatch active' : 'swatch'}
            style={{ background: color }}
            aria-label="Цвет помещения"
            onClick={() => props.onColor(color)}
          />
        ))}
      </div>
      {room.icon === 'custom' && (
        <IconPicker
          name={room.symbol ?? 'circle'}
          autoFocus
          onFocus={props.onTextFocus}
          onChange={props.onSymbol}
        />
      )}
    </>
  )
}
