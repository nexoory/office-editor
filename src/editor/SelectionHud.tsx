import { useEffect, useRef, useState } from 'react'
import { formatSize } from '../geometry/formatLength'
import { selectionAnchor } from '../geometry/hitTest'
import { theme } from '../theme'
import type { Floor, Selection, View } from '../types'

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
      {props.selection.kind === 'opening' && <OpeningHud floor={props.floor} id={props.selection.id} />}
      {props.selection.kind === 'room' && (
        <RoomHud
          floor={props.floor}
          id={props.selection.id}
          onRename={props.onRename}
          onColor={props.onColor}
          onTextFocus={props.onTextFocus}
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

function OpeningHud(props: { floor: Floor; id: string }) {
  const opening = props.floor.openings.find((item) => item.id === props.id)
  if (!opening) return null
  return <span className="hud-value">{formatSize(opening.width)}</span>
}

function RoomHud(props: {
  floor: Floor
  id: string
  onRename: (name: string) => void
  onColor: (color: string) => void
  onTextFocus: (focused: boolean) => void
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
    </>
  )
}
