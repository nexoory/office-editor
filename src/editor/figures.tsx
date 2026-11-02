import { doorSwing } from '../geometry/doors'
import { add, mul, norm, sub } from '../geometry/math'
import { wallEnds } from '../geometry/walls'
import { ACCESS_ICON_SIZE, AccessGlyph } from '../objects/icons'
import { chairsOf, OBJECTS, objectFill, stairDirectionOf, stairStepOf } from '../objects/catalog'
import { chairPose, worldToLocal } from '../objects/placement'
import { ChairGraphic, SignGraphic } from '../objects/signs'
import { theme } from '../theme'
import type { Floor, ObjectKind, PlanObject, Selection } from '../types'
import { HANDLE_R_PX, handlePoints, type ObjectHandle } from '../objects/handles'

const outline = {
  fill: 'none' as const,
  stroke: theme.selected,
  strokeWidth: 2,
  vectorEffect: 'non-scaling-stroke' as const,
}

export function FloorObjects(props: { floor: Floor; selection: Selection | null; zoom: number; filter: ObjectKind | null }) {
  return (
    <g pointerEvents="none">
      {props.floor.objects.map((object) => (
        <g key={object.id} transform={`translate(${object.x} ${object.y}) rotate(${(object.rotation * 180) / Math.PI})`}>
          <SignGraphic
            kind={object.kind}
            length={object.length}
            width={object.width}
            step={object.kind === 'stair' ? stairStepOf(object) : undefined}
            direction={object.kind === 'stair' ? stairDirectionOf(object) : undefined}
            color={objectFill(object)}
            symbol={object.symbol}
            zoom={props.zoom}
            dimmed={!!props.filter && object.kind !== props.filter && object.kind !== 'stair'}
          />
          {props.selection?.kind === 'object' && props.selection.id === object.id && (
            <rect x={-object.length / 2} y={-object.width / 2} width={object.length} height={object.width} {...outline} />
          )}
          {chairsOf(object).map((chair) => {
            const pose = chairPose(object, chair)
            const local = worldToLocal(object, pose)
            const turn = ((pose.rotation - object.rotation) * 180) / Math.PI
            const selected =
              props.selection?.kind === 'chair' &&
              props.selection.objectId === object.id &&
              props.selection.chairId === chair.id
            return (
              <g key={chair.id} transform={`translate(${local.x} ${local.y}) rotate(${turn})`}>
                <g transform={`scale(${chair.length} ${chair.width})`}>
                  <ChairGraphic color={objectFill(object)} />
                </g>
                {selected && (
                  <rect x={-chair.length / 2} y={-chair.width / 2} width={chair.length} height={chair.width} {...outline} />
                )}
              </g>
            )
          })}
        </g>
      ))}
    </g>
  )
}

export function ObjectHandles(props: { object: PlanObject; zoom: number; active: ObjectHandle | null }) {
  const { object, zoom } = props
  const points = handlePoints(object, zoom)
  const r = HANDLE_R_PX / zoom
  const grow = (handle: ObjectHandle) => (props.active === handle ? 1.3 : 1)
  const degrees = (object.rotation * 180) / Math.PI
  const side = r * 1.7 * grow('resize')
  return (
    <g pointerEvents="none">
      <line
        x1={points.stem.x}
        y1={points.stem.y}
        x2={points.rotate.x}
        y2={points.rotate.y}
        stroke={theme.selected}
        strokeWidth={1.5 / zoom}
      />
      <circle
        cx={points.rotate.x}
        cy={points.rotate.y}
        r={r * grow('rotate')}
        fill="#fff"
        stroke={theme.selected}
        strokeWidth={2 / zoom}
      />
      <rect
        x={points.resize.x - side / 2}
        y={points.resize.y - side / 2}
        width={side}
        height={side}
        transform={`rotate(${degrees} ${points.resize.x} ${points.resize.y})`}
        fill="#fff"
        stroke={theme.selected}
        strokeWidth={2 / zoom}
      />
    </g>
  )
}

export function PlacementGhost(props: { kind: ObjectKind; x: number; y: number; zoom: number }) {
  const spec = OBJECTS[props.kind]
  return (
    <g transform={`translate(${props.x} ${props.y})`} opacity={0.55} pointerEvents="none">
      <SignGraphic
        kind={props.kind}
        length={spec.length}
        width={spec.width}
        step={spec.step}
        direction={spec.direction}
        color={theme.objectNeutral[props.kind]}
        zoom={props.zoom}
      />
    </g>
  )
}

export function DoorLeaves(props: { floor: Floor; zoom: number; icons: boolean; selectedId: string | null; dimmed?: boolean }) {
  const iconSize = props.dimmed ? ACCESS_ICON_SIZE / 3 : ACCESS_ICON_SIZE
  return (
    <g pointerEvents="none">
      {props.floor.walls.flatMap((wall) => {
        if (wall.thickness <= 0) return []
        const ends = wallEnds(props.floor, wall)
        if (!ends) return []
        return props.floor.openings
          .filter((opening) => opening.wallId === wall.id && opening.kind === 'door')
          .map((opening) => {
            const swing = doorSwing(ends.a, ends.b, opening)
            if (!swing) return null
            const selected = props.selectedId === opening.id
            const along = norm(sub(ends.b, ends.a))
            const iconAt = add(ends.a, mul(along, opening.offset + opening.width / 2))
            return (
              <g key={opening.id}>
                {selected && (
                  <line
                    x1={swing.hinge.x}
                    y1={swing.hinge.y}
                    x2={swing.tip.x}
                    y2={swing.tip.y}
                    stroke={theme.selected}
                    strokeWidth={4.5 + 4 / props.zoom}
                    strokeLinecap="round"
                  />
                )}
                <line
                  x1={swing.hinge.x}
                  y1={swing.hinge.y}
                  x2={swing.tip.x}
                  y2={swing.tip.y}
                  stroke={theme.wall}
                  strokeWidth={4.5}
                  strokeLinecap="round"
                />
                <circle cx={swing.hinge.x} cy={swing.hinge.y} r={3.2} fill={theme.wall} />
                {props.icons && opening.access && opening.access !== 'none' && (
                  <g transform={`translate(${iconAt.x} ${iconAt.y}) scale(${1 / props.zoom})`} opacity={props.dimmed ? 0.4 : 1}>
                    <g transform={`translate(${-iconSize / 2} ${-iconSize / 2})`}>
                      <AccessGlyph access={opening.access} size={iconSize} color={props.dimmed ? theme.muted : undefined} />
                    </g>
                  </g>
                )}
              </g>
            )
          })
      })}
    </g>
  )
}
