import { theme } from '../theme'
import { FaIcon } from './faIcon'
import { findIcon } from './iconList'

const LEGACY_ROOM_ICONS: Record<string, string> = {
  meeting: 'users',
  wc: 'person',
  gym: 'dumbbell',
  lounge: 'couch',
  dining: 'bowl-food',
  cloakroom: 'shirt',
}

export const QUICK_ICONS = ['users', 'person', 'dumbbell', 'couch', 'bowl-food', 'shirt']

/** Имя знака комнаты. Старый тип и «своя иконка» читаются здесь, в документ заново не пишутся. */
export function roomIconName(room: { icon: string | null; symbol?: string }): string | null {
  if (!room.icon) return null
  if (room.icon === 'custom') return findIcon(room.symbol) ? (room.symbol ?? null) : null
  const legacy = LEGACY_ROOM_ICONS[room.icon]
  if (legacy) return legacy
  return findIcon(room.icon) ? room.icon : null
}

/** Знак Font Awesome отдельным svg для интерфейса. */
export function RoomGlyph(props: { name: string | null; size?: number; color?: string }) {
  const size = props.size ?? 16
  const color = props.color ?? theme.label
  const icon = findIcon(props.name ?? undefined)
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible" aria-hidden="true">
      <FaIcon icon={icon} size={size * 0.92} color={color} />
    </svg>
  )
}
