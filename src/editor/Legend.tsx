import type { ReactNode } from 'react'
import { AccessGlyph, ROOM_TYPES, RoomGlyph } from '../objects/icons'
import { OBJECT_ORDER, objectName } from '../objects/catalog'
import { TypeMark } from '../objects/signs'
import type { Floor, ObjectKind } from '../types'

export function Legend(props: { floor: Floor }) {
  const present = new Set<ObjectKind>(props.floor.objects.map((object) => object.kind))
  const items: { id: string; label: string; mark: ReactNode }[] = []
  for (const kind of OBJECT_ORDER) {
    if (!present.has(kind)) continue
    items.push({ id: kind, label: objectName(kind), mark: <TypeMark kind={kind} box={22} /> })
  }
  if (props.floor.openings.some((opening) => opening.kind === 'door' && opening.access === 'badge')) {
    items.push({ id: 'badge', label: 'Пропуск', mark: <AccessGlyph access="badge" size={18} /> })
  }
  if (props.floor.openings.some((opening) => opening.kind === 'door' && opening.access === 'key')) {
    items.push({ id: 'key', label: 'Ключ', mark: <AccessGlyph access="key" size={18} /> })
  }
  for (const type of ROOM_TYPES) {
    const sample = props.floor.rooms.find((room) => room.icon === type.id)
    if (!sample) continue
    items.push({ id: type.id, label: type.name, mark: <RoomGlyph icon={type.id} symbol={sample.symbol} size={26} /> })
  }
  if (items.length === 0) return null
  return (
    <div className="legend">
      {items.map((item) => (
        <div key={item.id} className="legend-item">
          {item.mark}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
