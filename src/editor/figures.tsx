import { memo } from 'react'
import { doorSwing } from '../geometry/doors'
import type { PlacedMarker } from '../geometry/lod'
import { wallEnds } from '../geometry/walls'
import { chairsOf, OBJECTS, objectFill, objectMatchesLegend, stairDirectionOf, stairStepOf } from '../objects/catalog'
import { kindLook, MarkerShape } from '../objects/markers'
import { chairPose, worldToLocal } from '../objects/placement'
import { ChairGraphic, SignGraphic } from '../objects/signs'
import { MARKER_PX } from '../constants'
import { theme } from '../theme'
import type { Floor, LegendFilter, ObjectKind, PlanObject, Selection } from '../types'
import { HANDLE_R_PX, handlePoints, type ObjectHandle } from '../objects/handles'

const outline = {
  fill: 'none' as const,
  stroke: theme.selected,
  strokeWidth: 2,
  vectorEffect: 'non-scaling-stroke' as const,
}

export const FloorObjects = memo(function FloorObjects(props: { floor: Floor; selection: Selection | null; editing: boolean; filter: LegendFilter | null }) {
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
            editing={props.editing}
            muted={!objectMatchesLegend(object, props.filter)}
          />
          {props.selection?.kind === 'object' && props.selection.id === object.id && (
            <rect data-export="omit" x={-object.length / 2} y={-object.width / 2} width={object.length} height={object.width} {...outline} />
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
                  <ChairGraphic color={objectFill(object)} editing={props.editing} />
                </g>
                {selected && (
                  <rect
                    data-export="omit"
                    x={-chair.length / 2}
                    y={-chair.width / 2}
                    width={chair.length}
                    height={chair.width}
                    {...outline}
                  />
                )}
              </g>
            )
          })}
        </g>
      ))}
    </g>
  )
})

/** Маркеры поверх чертежа: постоянный экранный размер, всегда стоят прямо. */
export const MarkerLayer = memo(function MarkerLayer(props: { markers: PlacedMarker[]; zoom: number }) {
  return (
    <g pointerEvents="none">
      {props.markers.map((marker) => (
        <g key={marker.key} transform={`translate(${marker.at.x} ${marker.at.y}) scale(${1 / props.zoom})`}>
          <MarkerShape
            level={marker.level}
            look={marker.look}
            size={marker.size}
            label={marker.label}
            selected={marker.selected}
            hovered={marker.hovered}
          />
        </g>
      ))}
    </g>
  )
})

export const ObjectHandles = memo(function ObjectHandles(props: { object: PlanObject; zoom: number; active: ObjectHandle | null }) {
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
})

export function PlacementGhost(props: { kind: ObjectKind; x: number; y: number; zoom: number }) {
  const spec = OBJECTS[props.kind]
  const look = kindLook(props.kind)
  return (
    <g transform={`translate(${props.x} ${props.y})`} opacity={0.7} pointerEvents="none">
      <SignGraphic
        kind={props.kind}
        length={spec.length}
        width={spec.width}
        step={spec.step}
        direction={spec.direction}
        color={look.color}
        editing
      />
      <g transform={`scale(${1 / props.zoom})`}>
        <MarkerShape level="badge" look={look} size={MARKER_PX} />
      </g>
    </g>
  )
}

export const DoorLeaves = memo(function DoorLeaves(props: { floor: Floor; zoom: number; selectedId: string | null }) {
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
            return (
              <g key={opening.id}>
                {selected && (
                  <line
                    data-export="omit"
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
              </g>
            )
          })
      })}
    </g>
  )
})
