import { MARKER_DOT_PX } from '../constants'
import { UI_FONT } from '../geometry/measureText'
import { theme } from '../theme'
import type { Access, ObjectKind, PlanObject } from '../types'
import { kindColor, objectFill, objectSymbol, typeSymbol } from './catalog'
import { FaIcon } from './faIcon'
import { findIcon } from './iconList'

export type MarkerLevel = 'dot' | 'badge' | 'label'

export type MarkerLook = { color: string; symbol: string }

export const MARKER_LABEL_FONT = `600 12px ${UI_FONT}`
export const MARKER_LABEL_GAP = 5
const SELECTED_SCALE = 1.15

export function objectLook(object: Pick<PlanObject, 'kind' | 'color' | 'symbol'>): MarkerLook {
  const symbol = findIcon(objectSymbol(object)) ? objectSymbol(object) : typeSymbol(object.kind)
  return { color: objectFill(object), symbol }
}

export function kindLook(kind: ObjectKind): MarkerLook {
  return { color: kindColor(kind), symbol: typeSymbol(kind) }
}

export function accessLook(access: Exclude<Access, 'none'>): MarkerLook {
  return { color: theme.access[access], symbol: access === 'badge' ? 'id-badge' : 'key' }
}

/**
 * Маркер в пикселях экрана, центр в нуле. Вызывающий сам компенсирует масштаб холста.
 * Точка — далеко, значок — средний масштаб, значок с подписью — близко.
 */
export function MarkerShape(props: {
  level: MarkerLevel
  look: MarkerLook
  size: number
  selected?: boolean
  hovered?: boolean
  label?: string | null
}) {
  const { look } = props
  if (props.level === 'dot') {
    const r = MARKER_DOT_PX / 2
    return (
      <g>
        <circle r={r + 1.5} fill={theme.markerRing} />
        <circle r={r} fill={look.color} />
        {(props.selected || props.hovered) && (
          <circle r={r + 3.5} fill="none" stroke={theme.selected} strokeOpacity={props.selected ? 1 : 0.5} strokeWidth={2} />
        )}
      </g>
    )
  }
  const r = (props.size / 2) * (props.selected ? SELECTED_SCALE : 1)
  const ring = Math.max(1.5, r * 0.1)
  const icon = findIcon(look.symbol)
  return (
    <g>
      <circle cy={r * 0.08} r={r + 0.75} fill="rgba(24, 22, 18, 0.22)" />
      <circle r={r} fill={theme.markerRing} />
      <circle r={r - ring} fill={look.color} />
      {icon && <FaIcon icon={icon} size={r * 1.12} color="#fff" />}
      {props.selected && <circle r={r + 2.5} fill="none" stroke={theme.selected} strokeWidth={2.5} />}
      {!props.selected && props.hovered && <circle r={r + 2} fill="none" stroke={theme.selected} strokeOpacity={0.55} strokeWidth={2} />}
      {props.level === 'label' && props.label && (
        <text
          x={r + MARKER_LABEL_GAP}
          dominantBaseline="central"
          style={{ font: MARKER_LABEL_FONT }}
          fill={theme.text}
          stroke={theme.floor}
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {props.label}
        </text>
      )}
    </g>
  )
}

/** Тот же маркер в интерфейсе: чипы, окно типов, меню, заголовок карточки. */
export function MarkerIcon(props: { look: MarkerLook; size?: number; muted?: boolean }) {
  const size = props.size ?? 20
  const look = props.muted ? { ...props.look, color: theme.markerMuted } : props.look
  return (
    <svg className="marker-icon" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <MarkerShape level="badge" look={look} size={size - 2} />
    </svg>
  )
}
