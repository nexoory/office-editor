import { faListUl, faBorderAll, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState } from 'react'
import { OBJECT_ORDER, objectName } from '../objects/catalog'
import { RoomGlyph, roomIconName } from '../objects/icons'
import { accessLook, kindLook, MarkerIcon } from '../objects/markers'
import { roomFill, roomInk } from '../theme'
import type { Floor, LegendFilter, ObjectKind } from '../types'
import { Glyph } from './Glyph'
import { IconButton } from './ui/Button'
import { Chip } from './ui/Chip'
import { Sheet } from './ui/Sheet'

/** Легенда просмотра: чипы типов этажа, они же фильтр, и список помещений за последним чипом. */
export function Legend(props: {
  floor: Floor
  filter: LegendFilter | null
  compact: boolean
  onFilter: (filter: LegendFilter | null) => void
  onRoom: (roomId: string) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [props.floor.id])
  const present = new Set<ObjectKind>(props.floor.objects.map((object) => object.kind))
  const kinds = OBJECT_ORDER.filter((kind) => present.has(kind))
  const doors = props.floor.openings.filter((opening) => opening.kind === 'door')
  const access = (['badge', 'key'] as const).filter((kind) => doors.some((opening) => opening.access === kind))
  const rooms = props.floor.rooms.flatMap((room) => {
    const icon = roomIconName(room)
    if (!room.name && !icon) return []
    return [{ id: room.id, name: room.name, icon, color: room.color }]
  })
  if (kinds.length === 0 && access.length === 0 && rooms.length === 0) return null

  const list = (
    <>
      <header className="list-head">
        <span>Помещения</span>
        <IconButton icon={faXmark} label="Закрыть" onClick={() => setOpen(false)} />
      </header>
      <div className="list">
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            className="list-row"
            onClick={() => {
              setOpen(false)
              props.onRoom(room.id)
            }}
          >
            <span className="card-symbol" style={{ background: roomFill(room.color), color: roomInk(room.color) }}>
              {room.icon ? <RoomGlyph name={room.icon} size={13} color="currentColor" /> : <Glyph icon={faBorderAll} size={12} />}
            </span>
            <span className={room.name ? 'list-name' : 'list-name muted'}>{room.name || 'Без названия'}</span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <>
      <div
        className="chips-row"
        role="toolbar"
        aria-label="Легенда"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY
        }}
      >
        {kinds.map((kind) => (
          <Chip key={kind} pressed={props.filter === kind} onClick={() => props.onFilter(kind)}>
            <MarkerIcon look={kindLook(kind)} size={18} muted={!!props.filter && props.filter !== kind} />
            {objectName(kind)}
          </Chip>
        ))}
        {access.map((kind) => (
          <Chip key={kind} pressed={props.filter === kind} onClick={() => props.onFilter(kind)}>
            <MarkerIcon look={accessLook(kind)} size={18} muted={!!props.filter && props.filter !== kind} />
            {kind === 'badge' ? 'Пропуск' : 'Ключ'}
          </Chip>
        ))}
        {rooms.length > 0 && (
          <Chip expanded={open} onClick={() => setOpen((value) => !value)}>
            <Glyph icon={faListUl} size={12} />
            Помещения
          </Chip>
        )}
      </div>
      {open &&
        (props.compact ? (
          <Sheet label="Помещения" className="rooms-sheet">
            {list}
          </Sheet>
        ) : (
          <div className="panel rooms-panel" onPointerDown={(event) => event.stopPropagation()}>
            {list}
          </div>
        ))}
    </>
  )
}
