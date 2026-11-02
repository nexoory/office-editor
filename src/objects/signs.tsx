import { faArrowRightLong } from '@fortawesome/free-solid-svg-icons'
import { theme } from '../theme'
import type { ObjectKind, StairDirection } from '../types'
import { FaIcon } from './faIcon'
import { stairDepths } from './placement'

const line = {
  fill: 'none' as const,
  stroke: theme.stairLine,
  strokeWidth: 1.25,
  vectorEffect: 'non-scaling-stroke' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Габарит предмета — геометрия, а не знак: тонкий контур и едва заметная заливка его цвета. */
function Footprint(props: { length: number; width: number; color: string; editing: boolean; muted: boolean }) {
  const radius = Math.min(10, props.length * 0.14, props.width * 0.14)
  const color = props.muted ? theme.markerMuted : props.color
  return (
    <rect
      x={-props.length / 2}
      y={-props.width / 2}
      width={props.length}
      height={props.width}
      rx={radius}
      ry={radius}
      fill={color}
      fillOpacity={props.editing ? 0.16 : 0.1}
      stroke={color}
      strokeOpacity={props.editing ? 0.85 : 0.5}
      strokeWidth={1}
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
      <rect
        x={-props.length / 2}
        y={-props.width / 2}
        width={props.length}
        height={props.width}
        {...line}
        fill={theme.floor}
        stroke={theme.wall}
      />
      {dividers}
      <g transform={props.direction === 'down' ? 'scale(-1 1)' : undefined}>
        <FaIcon icon={faArrowRightLong} size={arrow} color={theme.stairLine} halo={theme.floor} haloWidth={Math.max(2, arrow * 0.045)} />
      </g>
    </g>
  )
}

export function SignGraphic(props: {
  kind: ObjectKind
  length: number
  width: number
  color: string
  editing?: boolean
  step?: number
  direction?: StairDirection
  muted?: boolean
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
  return (
    <Footprint length={props.length} width={props.width} color={props.color} editing={!!props.editing} muted={!!props.muted} />
  )
}

export function ChairGraphic(props: { color: string; editing?: boolean }) {
  const mark = {
    fill: props.color,
    fillOpacity: props.editing ? 0.16 : 0.1,
    stroke: props.color,
    strokeOpacity: props.editing ? 0.85 : 0.5,
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  return (
    <g>
      <rect x={-0.34} y={-0.46} width={0.68} height={0.5} rx={0.16} {...mark} />
      <rect x={-0.46} y={0.16} width={0.92} height={0.28} rx={0.14} {...mark} />
    </g>
  )
}
