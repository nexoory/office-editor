import { AccessGlyph, RoomGlyph, roomIconName } from '../objects/icons'
import { OBJECT_ORDER, objectName } from '../objects/catalog'
import { TypeMark } from '../objects/signs'
import { theme } from '../theme'
import type { Floor, ObjectKind } from '../types'

export function Legend(props: {
  floor: Floor
  filter: ObjectKind | null
  top: number
  onFilter: (kind: ObjectKind | null) => void
  onRoom: (roomId: string) => void
}) {
  const present = new Set<ObjectKind>(props.floor.objects.map((object) => object.kind))
  const kinds = OBJECT_ORDER.filter((kind) => present.has(kind))
  const badge = props.floor.openings.some((opening) => opening.kind === 'door' && opening.access === 'badge')
  const key = props.floor.openings.some((opening) => opening.kind === 'door' && opening.access === 'key')
  const rooms = props.floor.rooms.flatMap((room) => {
    const icon = roomIconName(room)
    if (!room.name && !icon) return []
    return [{ id: room.id, name: room.name, icon, color: room.color ?? theme.floor }]
  })
  const hasObjects = kinds.length > 0 || badge || key
  if (!hasObjects && rooms.length === 0) return null
  return (
    <div className="legend" style={{ top: props.top }} onPointerDown={(event) => event.stopPropagation()}>
      {hasObjects && (
        <section className="legend-group">
          {props.filter && (
            <button type="button" className="legend-row" onClick={() => props.onFilter(null)}>
              Показать все
            </button>
          )}
          <h3>Объекты</h3>
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className="legend-row"
              aria-pressed={props.filter === kind}
              onClick={() => props.onFilter(kind)}
            >
              <TypeMark kind={kind} box={22} />
              <span>{objectName(kind)}</span>
            </button>
          ))}
          {badge && (
            <div className="legend-row legend-static">
              <AccessGlyph access="badge" size={18} />
              <span>Пропуск</span>
            </div>
          )}
          {key && (
            <div className="legend-row legend-static">
              <AccessGlyph access="key" size={18} />
              <span>Ключ</span>
            </div>
          )}
        </section>
      )}
      {rooms.length > 0 && (
        <section className="legend-group">
          <h3>Комнаты</h3>
          {rooms.map((room) => (
            <button key={room.id} type="button" className="legend-row" onClick={() => props.onRoom(room.id)}>
              {room.icon && <RoomGlyph name={room.icon} size={22} color={room.color} />}
              {room.name && <span>{room.name}</span>}
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
