import { faArrowRightLong } from '@fortawesome/free-solid-svg-icons'
import { theme } from '../theme'
import type { ObjectKind, StairDirection } from '../types'
import { typeSymbol } from './catalog'
import { FaIcon } from './faIcon'
import { findIcon } from './iconList'
import { ACCESS_ICON_SIZE } from './icons'
import { stairDepths } from './placement'

const ink = theme.wall

/** Доля меньшей стороны. Крупный предмет держит знак в этой доле, мелкий не опускает его ниже размера пропуска. */
const ICON_FIT = 0.75

const line = {
  fill: 'none' as const,
  stroke: ink,
  strokeWidth: 1.5,
  vectorEffect: 'non-scaling-stroke' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Footprint(props: { length: number; width: number; color: string }) {
  const radius = Math.min(12, props.length * 0.18, props.width * 0.18)
  return (
    <rect
      x={-props.length / 2}
      y={-props.width / 2}
      width={props.length}
      height={props.width}
      rx={radius}
      ry={radius}
      fill={props.color}
      fillOpacity={0.4}
      stroke={props.color}
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function StairSign(props: { length: number; width: number; step: number; direction: StairDirection }) {
  const depths = stairDepths(props.length, props.step)
  let cursor = -props.length / 2
  const dividers = depths.slice(0, -1).map((depth, index) => {
    cursor += depth
    return <line key={index} x1={cursor} y1={-props.width / 2} x2={cursor} y2={props.width / 2} {...line} />
  })
  const [iconWidth, iconHeight] = faArrowRightLong.icon
  const scale = Math.min((props.length * 0.72) / iconWidth, (props.width * 0.46) / iconHeight)
  const arrow = scale * Math.max(iconWidth, iconHeight)
  return (
    <g>
      <rect x={-props.length / 2} y={-props.width / 2} width={props.length} height={props.width} {...line} />
      {dividers}
      <g transform={props.direction === 'down' ? 'scale(-1 1)' : undefined}>
        <FaIcon icon={faArrowRightLong} size={arrow} color={ink} halo={theme.canvas} haloWidth={Math.max(2, arrow * 0.045)} />
      </g>
    </g>
  )
}

export function SignGraphic(props: {
  kind: ObjectKind
  length: number
  width: number
  color: string
  zoom: number
  step?: number
  direction?: StairDirection
  symbol?: string
  dimmed?: boolean
}) {
  if (props.kind === 'stair') {
    return (
      <StairSign
        length={props.length}
        width={props.width}
        step={props.step ?? props.length}
        direction={props.direction ?? 'up'}
      />
    )
  }
  const icon = findIcon(props.symbol) ?? findIcon(typeSymbol(props.kind))
  const fitted = Math.min(props.length, props.width) * ICON_FIT * props.zoom
  const full = Math.max(ACCESS_ICON_SIZE, fitted)
  const size = props.dimmed ? full / 3 : full
  return (
    <g>
      <Footprint length={props.length} width={props.width} color={props.color} />
      {icon && (
        <g transform={`scale(${1 / props.zoom})`} opacity={props.dimmed ? 0.4 : 1}>
          <FaIcon icon={icon} size={size} color={props.dimmed ? theme.muted : props.color} />
        </g>
      )}
    </g>
  )
}

export function ChairGraphic(props: { color: string }) {
  const mark = { ...line, stroke: props.color }
  return (
    <g>
      <rect x={-0.34} y={-0.46} width={0.68} height={0.5} rx={0.16} {...mark} fill={props.color} fillOpacity={0.4} />
      <rect x={-0.46} y={0.16} width={0.92} height={0.28} rx={0.14} {...mark} fill={props.color} fillOpacity={0.4} />
    </g>
  )
}

function MarkIcon(props: { name: string; box: number; color: string }) {
  const icon = findIcon(props.name)
  if (!icon) return null
  return (
    <svg width={props.box} height={props.box} viewBox={`${-props.box / 2} ${-props.box / 2} ${props.box} ${props.box}`} aria-hidden="true">
      <FaIcon icon={icon} size={props.box * 0.88} color={props.color} />
    </svg>
  )
}

export function TypeMark(props: { kind: ObjectKind; box?: number }) {
  const box = props.box ?? 28
  return <MarkIcon name={typeSymbol(props.kind)} box={box} color={theme.objectNeutral[props.kind]} />
}
