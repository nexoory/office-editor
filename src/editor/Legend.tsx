import { faListUl, faBorderAll, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState } from 'react'
import {
  OBJECT_ORDER,
  interestDisplayName,
  interestNameKey,
  objectName,
  sameLegendFilter,
  stairDirectionOf,
} from '../objects/catalog'
import { RoomGlyph, roomIconName } from '../objects/icons'
import { accessLook, kindLook, MarkerIcon, type MarkerLook } from '../objects/markers'
import { roomFill, roomInk } from '../theme'
import type { Floor, LegendFilter } from '../types'
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
  const entries = legendEntries(props.floor)
  const doors = props.floor.openings.filter((opening) => opening.kind === 'door')
  const access = (['badge', 'key'] as const).filter((kind) => doors.some((opening) => opening.access === kind))
  const rooms = props.floor.rooms.flatMap((room) => {
    const icon = roomIconName(room)
    if (!room.name && !icon) return []
    return [{ id: room.id, name: room.name, icon, color: room.color }]
  })
  if (entries.length === 0 && access.length === 0 && rooms.length === 0) return null

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
        {entries.map((entry) => {
          const pressed = sameLegendFilter(props.filter, entry.filter)
          return (
            <Chip key={entry.key} pressed={pressed} onClick={() => props.onFilter(entry.filter)}>
              <MarkerIcon look={entry.look} size={18} muted={!!props.filter && !pressed} />
              {entry.label}
            </Chip>
          )
        })}
        {access.map((kind) => {
          const filter: LegendFilter = { type: 'access', access: kind }
          const pressed = sameLegendFilter(props.filter, filter)
          return (
            <Chip key={kind} pressed={pressed} onClick={() => props.onFilter(filter)}>
              <MarkerIcon look={accessLook(kind)} size={18} muted={!!props.filter && !pressed} />
              {kind === 'badge' ? 'Пропуск' : 'Ключ'}
            </Chip>
          )
        })}
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

function legendEntries(floor: Floor): { key: string; filter: LegendFilter; label: string; look: MarkerLook }[] {
  const present = new Set(floor.objects.map((object) => object.kind))
  const entries: { key: string; filter: LegendFilter; label: string; look: MarkerLook }[] = []
  for (const kind of OBJECT_ORDER) {
    if (kind === 'stair') {
      for (const direction of ['up', 'down'] as const) {
        if (!floor.objects.some((object) => object.kind === 'stair' && stairDirectionOf(object) === direction)) continue
        entries.push({
          key: `stair:${direction}`,
          filter: { type: 'stair', direction },
          label: direction === 'up' ? 'Подъем' : 'Спуск',
          look: { ...kindLook('stair'), flip: direction === 'down' },
        })
      }
      continue
    }
    if (kind === 'interest') {
      const seen = new Set<string>()
      for (const object of floor.objects) {
        if (object.kind !== 'interest') continue
        const key = interestNameKey(object.name)
        if (seen.has(key)) continue
        seen.add(key)
        entries.push({
          key: `interest:${key}`,
          filter: { type: 'interest', key },
          label: interestDisplayName(object.name),
          look: kindLook('interest'),
        })
      }
      continue
    }
    if (!present.has(kind)) continue
    entries.push({
      key: kind,
      filter: { type: 'object', kind },
      label: objectName(kind),
      look: kindLook(kind),
    })
  }
  return entries
}
