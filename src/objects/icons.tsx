import { faIdBadge, faKey } from '@fortawesome/free-solid-svg-icons'
import { theme } from '../theme'
import type { Access } from '../types'
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

export const ROOM_ICON_SIZE = 48
export const ACCESS_ICON_SIZE = 36

/** Имя знака комнаты. Старый тип и «своя иконка» читаются здесь, в документ заново не пишутся. */
export function roomIconName(room: { icon: string | null; symbol?: string }): string | null {
  if (!room.icon) return null
  if (room.icon === 'custom') return findIcon(room.symbol) ? (room.symbol ?? null) : null
  const legacy = LEGACY_ROOM_ICONS[room.icon]
  if (legacy) return legacy
  return findIcon(room.icon) ? room.icon : null
}

export function RoomGlyph(props: { name: string | null; size?: number; color?: string }) {
  const size = props.size ?? ROOM_ICON_SIZE
  const color = props.color ?? theme.label
  const icon = findIcon(props.name ?? undefined)
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible" aria-hidden="true">
      <FaIcon icon={icon} size={size * 0.92} color={color} />
    </svg>
  )
}

export function AccessGlyph(props: { access: Exclude<Access, 'none'>; size?: number; color?: string }) {
  const size = props.size ?? ACCESS_ICON_SIZE
  const color = props.color ?? (props.access === 'badge' ? theme.doorBadge : theme.doorKey)
  const icon = props.access === 'badge' ? faIdBadge : faKey
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible" aria-hidden="true">
      <FaIcon icon={icon} size={size} color={color} />
    </svg>
  )
}
