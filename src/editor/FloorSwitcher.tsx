import { useEffect, useRef, useState } from 'react'
import type { Floor } from '../types'

export function FloorSwitcher(props: {
  floors: Floor[]
  floor: Floor
  editing: boolean
  canRaise: boolean
  onSwitch: (delta: number) => void
  onAdd: (delta: -1 | 1) => void
  onDelete: () => void
  onRaise: () => void
  onRename: (name: string) => void
  onTextFocus: (focused: boolean) => void
}) {
  const index = props.floors.findIndex((floor) => floor.id === props.floor.id)
  const [draft, setDraft] = useState(props.floor.name)
  const revert = useRef(false)
  useEffect(() => setDraft(props.floor.name), [props.floor.id, props.floor.name])

  const commit = () => {
    const name = draft.trim() || props.floor.name
    setDraft(name)
    if (name !== props.floor.name) props.onRename(name)
  }

  return (
    <div className="floors">
      {props.editing && (
        <button type="button" onClick={() => props.onAdd(-1)}>
          Новый ниже
        </button>
      )}
      <button type="button" disabled={index <= 0} onClick={() => props.onSwitch(-1)} aria-label="Этаж ниже">
        ↓
      </button>
      {props.editing ? (
        <input
          aria-label="Название этажа"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => props.onTextFocus(true)}
          onBlur={() => {
            props.onTextFocus(false)
            if (revert.current) {
              revert.current = false
              setDraft(props.floor.name)
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
      ) : (
        <span>{props.floor.name}</span>
      )}
      <button
        type="button"
        disabled={index < 0 || index >= props.floors.length - 1}
        onClick={() => props.onSwitch(1)}
        aria-label="Этаж выше"
      >
        ↑
      </button>
      {props.editing && (
        <button type="button" onClick={() => props.onAdd(1)}>
          Новый выше
        </button>
      )}
      {props.editing && (
        <button type="button" disabled={!props.canRaise} onClick={props.onRaise}>
          Поднять стены
        </button>
      )}
      {props.editing && (
        <button type="button" disabled={props.floors.length <= 1} onClick={props.onDelete} aria-label="Удалить этаж">
          ×
        </button>
      )}
    </div>
  )
}
