import { theme } from '../theme'
import type { ObjectKind, StairDirection } from '../types'
import { stairDepths } from './placement'

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

/** Ступени от локального −x: первая прозрачная, дальше светлеют вверх или темнеют вниз. */
function StairSign(props: { length: number; width: number; step: number; direction: StairDirection; muted: boolean }) {
  const depths = stairDepths(props.length, props.step)
  const last = Math.max(depths.length - 1, 1)
  const tint = props.muted ? theme.markerMuted : props.direction === 'down' ? '#000' : '#fff'
  const stroke = props.muted ? theme.markerMuted : theme.stairLine
  let cursor = -props.length / 2
  const treads = depths.map((depth, index) => {
    const x = cursor
    cursor += depth
    return (
      <rect
        key={index}
        x={x}
        y={-props.width / 2}
        width={depth}
        height={props.width}
        fill={tint}
        fillOpacity={index === 0 ? 0 : (index / last) * 0.45}
        stroke="none"
      />
    )
  })
  cursor = -props.length / 2
  const dividers = depths.slice(0, -1).map((depth, index) => {
    cursor += depth
    return (
      <line
        key={index}
        x1={cursor}
        y1={-props.width / 2}
        x2={cursor}
        y2={props.width / 2}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    )
  })
  return (
    <g>
      {treads}
      <rect
        x={-props.length / 2}
        y={-props.width / 2}
        width={props.length}
        height={props.width}
        fill="none"
        stroke={props.muted ? theme.markerMuted : theme.wall}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
      {dividers}
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
        muted={!!props.muted}
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
