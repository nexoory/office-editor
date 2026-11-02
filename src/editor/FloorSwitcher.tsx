import { faPlus } from '@fortawesome/free-solid-svg-icons'
import type { Floor } from '../types'
import { IconButton } from './ui/Button'

export function FloorLabel(props: { floors: Floor[]; floor: Floor }) {
  const index = props.floors.findIndex((floor) => floor.id === props.floor.id)
  const number = index >= 0 ? index + 1 : 1
  return (
    <div className="floor-label" aria-label={`Этаж ${number}`}>
      Этаж <b>{number}</b>
    </div>
  )
}

/** Переключатель этажей, как во внутренних картах: номера сверху вниз, текущий подсвечен. */
export function FloorLift(props: {
  floors: Floor[]
  floor: Floor
  editing: boolean
  onSwitch: (delta: number) => void
  onAdd: (delta: -1 | 1) => void
}) {
  const index = props.floors.findIndex((floor) => floor.id === props.floor.id)
  const atBottom = index === 0
  const atTop = index >= 0 && index === props.floors.length - 1
  if (props.floors.length < 2 && !props.editing) return null
  const order = props.floors.map((floor, position) => ({ floor, position })).reverse()
  return (
    <div className="panel floor-lift" role="group" aria-label="Этажи" onPointerDown={(event) => event.stopPropagation()}>
      {props.editing && (
        <IconButton icon={faPlus} size={11} label="Новый этаж выше" disabled={!atTop} onClick={() => props.onAdd(1)} />
      )}
      <div className="lift-floors">
        {order.map(({ floor, position }) => (
          <button
            key={floor.id}
            type="button"
            className="lift-item"
            aria-pressed={position === index}
            aria-label={`Этаж ${position + 1}`}
            onClick={() => props.onSwitch(position - index)}
          >
            {position + 1}
          </button>
        ))}
      </div>
      {props.editing && (
        <IconButton icon={faPlus} size={11} label="Новый этаж ниже" disabled={!atBottom} onClick={() => props.onAdd(-1)} />
      )}
    </div>
  )
}
