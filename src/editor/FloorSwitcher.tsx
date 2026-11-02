import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { FaIcon } from '../objects/faIcon'
import type { Floor } from '../types'

export function FloorSwitcher(props: {
  floors: Floor[]
  floor: Floor
  editing: boolean
  shellEditing: boolean
  browsing: boolean
  onBrowse: (browsing: boolean) => void
  onSwitch: (delta: number) => void
  onAdd: (delta: -1 | 1) => void
}) {
  const index = props.floors.findIndex((floor) => floor.id === props.floor.id)
  const atBottom = index === 0
  const atTop = index >= 0 && index === props.floors.length - 1
  const number = index >= 0 ? index + 1 : 1

  return (
    <>
      <div className="floor-number" aria-label={`Этаж ${number}`}>
        <span className="floor-word">Этаж</span>
        <span>{number}</span>
      </div>
      {props.shellEditing && (
        <div className="mode-switch" role="group" aria-label="Режим">
          <button type="button" aria-pressed={!props.browsing} onClick={() => props.onBrowse(false)}>
            Редактирование
          </button>
          <button type="button" aria-pressed={props.browsing} onClick={() => props.onBrowse(true)}>
            Просмотр
          </button>
        </div>
      )}
      <div className="floor-nav">
        <div className="floor-cluster">
          {props.editing && (
            <button
              type="button"
              className="floor-add"
              disabled={!atTop}
              onClick={() => props.onAdd(1)}
              aria-label="Новый выше"
            >
              <PlusMark />
            </button>
          )}
          <button
            type="button"
            className="floor-step"
            disabled={atTop}
            onClick={() => props.onSwitch(1)}
            aria-label="Этаж выше"
          >
            <Chevron direction="up" />
          </button>
        </div>
        <div className="floor-cluster">
          <button
            type="button"
            className="floor-step"
            disabled={atBottom}
            onClick={() => props.onSwitch(-1)}
            aria-label="Этаж ниже"
          >
            <Chevron direction="down" />
          </button>
          {props.editing && (
            <button
              type="button"
              className="floor-add"
              disabled={!atBottom}
              onClick={() => props.onAdd(-1)}
              aria-label="Новый ниже"
            >
              <PlusMark />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function PlusMark() {
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
      <FaIcon icon={faPlus} size={14} color="currentColor" />
    </svg>
  )
}

function Chevron(props: { direction: 'up' | 'down' }) {
  const up = props.direction === 'up'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d={up ? 'M5 13.5 L11 7.5 L17 13.5' : 'M5 8.5 L11 14.5 L17 8.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
