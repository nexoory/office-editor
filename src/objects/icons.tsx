import { faBowlFood, faCouch, faDumbbell, faIdBadge, faKey, faPerson, faShirt, faUsers } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { theme } from '../theme'
import type { Access, RoomIcon } from '../types'
import { FaIcon } from './faIcon'
import { findIcon } from './iconList'

const ROOM_ICONS: Record<Exclude<RoomIcon, 'custom'>, IconDefinition> = {
  meeting: faUsers,
  wc: faPerson,
  gym: faDumbbell,
  lounge: faCouch,
  dining: faBowlFood,
  cloakroom: faShirt,
}

const ROOM_NAMES: Record<RoomIcon, string> = {
  meeting: 'Переговорная',
  wc: 'Туалет',
  gym: 'Спортзал',
  lounge: 'Комната отдыха',
  dining: 'Столовая',
  cloakroom: 'Гардеробная',
  custom: 'Своя иконка',
}

export const ROOM_TYPES: { id: RoomIcon; name: string }[] = (Object.keys(ROOM_NAMES) as RoomIcon[]).map((id) => ({
  id,
  name: ROOM_NAMES[id],
}))

export const ROOM_ICON_SIZE = 48
export const ACCESS_ICON_SIZE = 36

export function RoomGlyph(props: { icon: RoomIcon; symbol?: string; size?: number; color?: string }) {
  const size = props.size ?? ROOM_ICON_SIZE
  const color = props.color ?? theme.label
  const icon = props.icon === 'custom' ? findIcon(props.symbol) : ROOM_ICONS[props.icon]
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible" aria-hidden="true">
      <FaIcon icon={icon} size={size * 0.92} color={color} />
    </svg>
  )
}

export function AccessGlyph(props: { access: Exclude<Access, 'none'>; size?: number }) {
  const size = props.size ?? ACCESS_ICON_SIZE
  const color = props.access === 'badge' ? theme.doorBadge : theme.doorKey
  const icon = props.access === 'badge' ? faIdBadge : faKey
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible" aria-hidden="true">
      <FaIcon icon={icon} size={size} color={color} halo="#ffffff" haloWidth={size * 0.14} />
    </svg>
  )
}
