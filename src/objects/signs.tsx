import { faArrowRightLong, faBed, faCircle, faComputer, faCouch, faDroplet, faShirt, faShower, faSink, faSnowflake, faStairs, faToilet, faUtensils } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { theme } from '../theme'
import type { ObjectKind, StairDirection } from '../types'
import { FaIcon } from './faIcon'
import { findIcon } from './iconList'
import { stairDepths } from './placement'

const ink = theme.wall

const line = {
  fill: 'none' as const,
  stroke: ink,
  strokeWidth: 1.5,
  vectorEffect: 'non-scaling-stroke' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const OBJECT_ICONS: Partial<Record<ObjectKind, IconDefinition>> = {
  stair: faStairs,
  cooler: faDroplet,
  microwave: faUtensils,
  wardrobe: faShirt,
  toilet: faToilet,
  sink: faSink,
  shower: faShower,
  fridge: faSnowflake,
  bed: faBed,
  sofa: faCouch,
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
      stroke={ink}
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
  step?: number
  direction?: StairDirection
  symbol?: string
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
  if (props.kind === 'interest') {
    const icon = findIcon(props.symbol) ?? findIcon('circle')
    const size = Math.min(props.length, props.width) * 0.66
    return (
      <g>
        <Footprint length={props.length} width={props.width} color={props.color} />
        {icon && <FaIcon icon={icon} size={size} color={ink} />}
      </g>
    )
  }
  if (props.kind === 'table') {
    return (
      <g transform={`scale(${props.length} ${props.width})`}>
        <rect x={-0.5} y={-0.5} width={1} height={1} rx={0.08} {...line} fill={props.color} fillOpacity={0.34} />
      </g>
    )
  }
  const icon = OBJECT_ICONS[props.kind]
  const size = Math.min(props.length, props.width) * 0.66
  return (
    <g>
      <Footprint length={props.length} width={props.width} color={props.color} />
      {icon && <FaIcon icon={icon} size={size} color={ink} />}
    </g>
  )
}

export function ChairGraphic(props: { color: string }) {
  return (
    <g>
      <rect x={-0.34} y={-0.46} width={0.68} height={0.5} rx={0.16} {...line} fill={props.color} />
      <rect x={-0.46} y={0.16} width={0.92} height={0.28} rx={0.14} {...line} fill={props.color} />
    </g>
  )
}

function MarkIcon(props: { icon: IconDefinition; box: number; color: string }) {
  return (
    <svg width={props.box} height={props.box} viewBox={`${-props.box / 2} ${-props.box / 2} ${props.box} ${props.box}`} aria-hidden="true">
      <FaIcon icon={props.icon} size={props.box * 0.88} color={props.color} />
    </svg>
  )
}

export function TypeMark(props: { kind: ObjectKind; box?: number; menu?: boolean }) {
  const box = props.box ?? 28
  const color = theme.objectNeutral[props.kind]
  if (props.kind === 'table') {
    if (props.menu) return <MarkIcon icon={faComputer} box={box} color={color} />
    return (
      <svg width={box} height={box} viewBox="0 0 28 28" aria-hidden="true">
        <rect x={4} y={7} width={20} height={14} rx={3.5} fill={color} fillOpacity={0.9} stroke={ink} strokeWidth={1.5} />
      </svg>
    )
  }
  if (props.kind === 'interest') return <MarkIcon icon={faCircle} box={box} color={color} />
  const icon = OBJECT_ICONS[props.kind]
  if (!icon) return null
  return (
    <svg width={box} height={box} viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} aria-hidden="true">
      <FaIcon icon={icon} size={box * 0.88} color={color} />
    </svg>
  )
}
