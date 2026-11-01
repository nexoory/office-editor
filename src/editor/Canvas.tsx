import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import { GRID_STEP } from '../constants'
import type { EditorState, PointerInfo } from './reduce'
import { activeFloor, cursorFor, ghostFloor } from './reduce'
import { analyze, sameIds, type AnalyzedFace } from '../geometry/faces'
import { formatLength } from '../geometry/formatLength'
import { add, dist, interiorPoint, left, mul, norm, pointInPolygon, pointInRegion, projectSegment, sub } from '../geometry/math'
import { safeOffset } from '../geometry/polygon'
import {
  alignmentGuides,
  computePreview,
  incidentWallIds,
  labelForWall,
  lengthLabel,
  type Preview,
} from '../geometry/preview'
import { theme } from '../theme'
import type { Floor, Point } from '../types'
import { wallEnds, wallGraphics } from '../geometry/walls'

export function Canvas(props: {
  state: EditorState
  editing: boolean
  onPointerDown: (info: PointerInfo) => void
  onPointerMove: (info: PointerInfo) => void
  onPointerUp: (info: PointerInfo) => void
  onWheel: (info: { sx: number; sy: number; deltaY: number; ctrl: boolean }) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 1, h: 1 })
  const wheel = useRef(props.onWheel)
  wheel.current = props.onWheel

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    })
    observer.observe(element)
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      wheel.current({
        sx: event.clientX - rect.left,
        sy: event.clientY - rect.top,
        deltaY: event.deltaY,
        ctrl: event.ctrlKey || event.metaKey,
      })
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  const { state } = props
  const floor = activeFloor(state)
  const ghost = ghostFloor(state)
  const { zoom } = state.view
  const bounds = viewBounds(state.view, size.w, size.h)
  const analysis = analyze(floor)
  const graphics = wallGraphics(floor, props.editing)
  const ghostGraphics = ghost ? wallGraphics(ghost, props.editing) : null
  const preview = livePreview(state)
  const labels = moveLabels(state, floor)
  const guides =
    state.gesture?.type === 'move-vertex'
      ? alignmentGuides(floor, [state.gesture.id], zoom)
      : state.gesture?.type === 'move-wall'
        ? alignmentGuides(floor, wallVertexIds(floor, state.gesture.id), zoom)
        : []

  const locate = (event: ReactPointerEvent<SVGSVGElement>): PointerInfo => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      button: event.button,
      sx: event.clientX - rect.left,
      sy: event.clientY - rect.top,
      shift: event.shiftKey,
    }
  }

  return (
    <svg
      ref={ref}
      style={{ cursor: cursorFor(state) }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // A pointer that is already gone cannot be captured; the gesture still starts.
        }
        props.onPointerDown(locate(event))
      }}
      onPointerMove={(event) => props.onPointerMove(locate(event))}
      onPointerUp={(event) => props.onPointerUp(locate(event))}
    >
      <g transform={`translate(${state.view.panX} ${state.view.panY}) scale(${zoom})`}>
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.w}
          height={bounds.h}
          fill={theme.canvas}
        />
        <Grid bounds={bounds} zoom={zoom} />
        {analysis.faces.map((face) => {
          const room = floor.rooms.find((item) => sameIds(item.vertexIds, face.vertexIds))
          if (!room) return null
          const shape = floorShape(floor, face)
          const selected = state.selection?.kind === 'room' && state.selection.id === room.id
          return (
            <path
              key={room.id}
              d={pathOf(shape.outer, shape.holes)}
              fill={room.color ?? theme.floor}
              fillRule="evenodd"
              stroke={selected ? theme.selected : 'none'}
              strokeWidth={selected ? 2 / zoom : 0}
              pointerEvents="none"
            />
          )
        })}
        {ghostGraphics && (
          <g opacity={0.33} pointerEvents="none">
            {ghostGraphics.solids.map((solid, index) => (
              <polygon key={`g${index}`} points={poly(solid.points)} fill={theme.wall} />
            ))}
            {ghostGraphics.windows.map((item) => (
              <polygon key={item.openingId} points={poly(item.points)} fill={theme.window} />
            ))}
          </g>
        )}
        {ghostGraphics?.dashes.map((dash) => (
          <line
            key={dash.wallId}
            x1={dash.a.x}
            y1={dash.a.y}
            x2={dash.b.x}
            y2={dash.b.y}
            stroke={theme.ghostDash}
            strokeWidth={1.25 / zoom}
            strokeDasharray={`${5 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        ))}
        {props.editing &&
          ghost?.vertices.map((vertex) => (
            <circle
              key={vertex.id}
              cx={vertex.x}
              cy={vertex.y}
              r={2.6 / zoom}
              fill={theme.ghostVertex}
              pointerEvents="none"
            />
          ))}
        <g pointerEvents="none">
          {graphics.solids.map((solid, index) => (
            <polygon
              key={`${solid.wallId}-${index}`}
              points={poly(solid.points)}
              fill={state.selection?.kind === 'wall' && state.selection.id === solid.wallId ? theme.selected : theme.wall}
            />
          ))}
          {graphics.windows.map((item) => (
            <g key={item.openingId}>
              <polygon
                points={poly(item.points)}
                fill={theme.window}
                stroke={state.selection?.kind === 'opening' && state.selection.id === item.openingId ? theme.selected : 'none'}
                strokeWidth={2 / zoom}
              />
              <line
                x1={item.a.x}
                y1={item.a.y}
                x2={item.b.x}
                y2={item.b.y}
                stroke={theme.windowLine}
                strokeWidth={1.2 / zoom}
              />
            </g>
          ))}
          {graphics.dashes.map((dash) => (
            <line
              key={dash.wallId}
              x1={dash.a.x}
              y1={dash.a.y}
              x2={dash.b.x}
              y2={dash.b.y}
              stroke={state.selection?.kind === 'wall' && state.selection.id === dash.wallId ? theme.selected : theme.wall}
              strokeWidth={1.4 / zoom}
              strokeDasharray={`${6 / zoom} ${5 / zoom}`}
            />
          ))}
          {floor.openings
            .filter((opening) => opening.kind === 'passage' && state.selection?.kind === 'opening' && state.selection.id === opening.id)
            .map((opening) => {
              const wall = floor.walls.find((item) => item.id === opening.wallId)
              const ends = wall && wallEnds(floor, wall)
              if (!wall || !ends || wall.thickness <= 0) return null
              const rect = openingQuad(ends.a, ends.b, wall.thickness, opening.offset, opening.width)
              return (
                <polygon
                  key={opening.id}
                  points={poly(rect)}
                  fill="none"
                  stroke={theme.selected}
                  strokeWidth={2 / zoom}
                />
              )
            })}
        </g>
        {props.editing &&
          floor.vertices.map((vertex) => {
            const selected = state.selection?.kind === 'vertex' && state.selection.id === vertex.id
            return (
              <circle
                key={vertex.id}
                cx={vertex.x}
                cy={vertex.y}
                r={(selected ? 6 : 3.4) / zoom}
                fill={selected ? theme.selected : theme.vertex}
                pointerEvents="none"
              />
            )
          })}
        {analysis.faces.map((face) => {
          const room = floor.rooms.find((item) => sameIds(item.vertexIds, face.vertexIds))
          if (!room?.name) return null
          const shape = floorShape(floor, face)
          const center = labelPoint(shape.outer, shape.holes)
          const width = span(shape.outer) * zoom - 8
          return (
            <text
              key={`${room.id}-name`}
              x={center.x}
              y={center.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={14 / zoom}
              fill={theme.label}
              pointerEvents="none"
            >
              {ellipsize(room.name, width)}
            </text>
          )
        })}
        {guides.map((guide, index) => (
          <line
            key={`guide${index}`}
            x1={guide.a.x}
            y1={guide.a.y}
            x2={guide.b.x}
            y2={guide.b.y}
            stroke={theme.guide}
            strokeWidth={1 / zoom}
            strokeDasharray={`${3 / zoom} ${3 / zoom}`}
            pointerEvents="none"
          />
        ))}
        {state.chain?.map((point, index) => (
          <circle
            key={`chain${index}`}
            cx={point.x}
            cy={point.y}
            r={(index === 0 && state.chain && state.chain.length >= 3 ? 7 : 4) / zoom}
            fill={index === 0 && state.chain && state.chain.length >= 3 ? theme.close : theme.snap}
            pointerEvents="none"
          />
        ))}
        {preview && preview.length > 1e-3 && <PreviewShape preview={preview} zoom={zoom} />}
        {[...labels, ...(preview && preview.length >= 0.01 ? [lengthLabel(preview.start, preview.end, zoom, formatLength(preview.length))] : [])].map(
          (label, index) => (
            <text
              key={`len${index}`}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12 / zoom}
              fill={theme.label}
              stroke={theme.labelHalo}
              strokeWidth={3 / zoom}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {label.text}
            </text>
          ),
        )}
      </g>
    </svg>
  )
}

function Grid(props: { bounds: { x: number; y: number; w: number; h: number }; zoom: number }) {
  const { bounds, zoom } = props
  const step = GRID_STEP
  const x0 = Math.floor(bounds.x / step) * step
  const y0 = Math.floor(bounds.y / step) * step
  const x1 = bounds.x + bounds.w
  const y1 = bounds.y + bounds.h
  const lines: ReactElement[] = []
  const maxLines = 80
  const count = Math.ceil((x1 - x0) / step) + Math.ceil((y1 - y0) / step)
  const used = count > maxLines * 2 ? step * Math.ceil(count / (maxLines * 2)) : step
  for (let x = Math.floor(bounds.x / used) * used; x <= x1; x += used) {
    lines.push(<line key={`v${x}`} x1={x} y1={bounds.y} x2={x} y2={y1} />)
  }
  for (let y = Math.floor(bounds.y / used) * used; y <= y1; y += used) {
    lines.push(<line key={`h${y}`} x1={bounds.x} y1={y} x2={x1} y2={y} />)
  }
  return (
    <g stroke={theme.grid} strokeWidth={1 / zoom} pointerEvents="none">
      {lines}
    </g>
  )
}

function PreviewShape(props: { preview: Preview; zoom: number }) {
  const { preview, zoom } = props
  const a = preview.start
  const b = preview.end
  const color = preview.onGhostAxis ? theme.align : preview.valid ? theme.selected : theme.muted
  return (
    <g pointerEvents="none">
      {preview.thickness > 0 && preview.valid ? (
        <polygon points={poly(openingQuad(a, b, preview.thickness, 0, Math.hypot(b.x - a.x, b.y - a.y)))} fill={color} opacity={0.45} />
      ) : (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={1.6 / zoom}
          strokeDasharray={preview.valid ? undefined : `${4 / zoom} ${3 / zoom}`}
        />
      )}
      {preview.snap !== 'none' && (
        <circle
          cx={b.x}
          cy={b.y}
          r={(preview.snap === 'close' ? 8 : 6) / zoom}
          fill="none"
          stroke={preview.snap === 'close' ? theme.close : theme.snap}
          strokeWidth={1.6 / zoom}
        />
      )}
    </g>
  )
}

function livePreview(state: EditorState): Preview | null {
  if (!state.cursor) return null
  if (
    state.gesture &&
    state.gesture.type !== 'draw' &&
    state.gesture.type !== 'pending' &&
    state.gesture.type !== 'pan'
  ) {
    return null
  }
  const anchor = state.gesture?.type === 'draw' ? state.gesture.anchor : state.chain?.[state.chain.length - 1]
  if (!anchor) return null
  const raw = state.cursor
  return computePreview({
    floor: activeFloor(state),
    ghost: ghostFloor(state),
    anchor,
    cursor: raw,
    raw,
    shift: raw.shift,
    zoom: state.view.zoom,
    lockWallId: state.axisLock,
    chain: state.chain,
  }).preview
}

function moveLabels(state: EditorState, floor: Floor) {
  if (state.gesture?.type === 'move-vertex') {
    return incidentWallIds(floor, state.gesture.id)
      .map((id) => labelForWall(floor, id, state.view.zoom))
      .filter((item): item is NonNullable<typeof item> => !!item)
  }
  if (state.gesture?.type === 'move-wall') {
    const label = labelForWall(floor, state.gesture.id, state.view.zoom)
    return label ? [label] : []
  }
  return []
}

function wallVertexIds(floor: Floor, wallId: string): string[] {
  const wall = floor.walls.find((item) => item.id === wallId)
  return wall ? [wall.a, wall.b] : []
}

function floorShape(floor: Floor, face: AnalyzedFace) {
  return {
    outer: safeOffset(face.outer, halfWidths(floor, face.vertexIds), true),
    holes: face.holeIds.map((ids, index) => safeOffset(face.holes[index] ?? [], halfWidths(floor, ids), false)),
  }
}

function halfWidths(floor: Floor, ids: string[]): number[] {
  return ids.map((id, index) => {
    const next = ids[(index + 1) % ids.length]
    const wall = floor.walls.find(
      (item) => (item.a === id && item.b === next) || (item.a === next && item.b === id),
    )
    return (wall?.thickness ?? 0) / 2
  })
}

function pathOf(outer: Point[], holes: Point[][]): string {
  return [outer, ...holes].map(ringPath).join(' ')
}

function ringPath(points: Point[]): string {
  if (points.length === 0) return ''
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} Z`
}

function poly(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function openingQuad(a: Point, b: Point, thickness: number, offset: number, width: number): Point[] {
  const d = norm(sub(b, a))
  const n = left(d)
  const h = thickness / 2
  const p0 = add(a, mul(d, offset))
  const p1 = add(a, mul(d, offset + width))
  return [add(p0, mul(n, -h)), add(p1, mul(n, -h)), add(p1, mul(n, h)), add(p0, mul(n, h))]
}

function labelPoint(points: Point[], holes: Point[][]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const average = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  const center = { x: average.x / points.length, y: average.y / points.length }
  if (holes.length === 0) return pointInPolygon(center, points) ? center : interiorPoint(points)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  let best = pointInRegion(center, points, holes) ? center : null
  let bestScore = best ? clearance(best, points, holes) : -1
  const steps = 7
  for (let row = 0; row <= steps; row++) {
    for (let column = 0; column <= steps; column++) {
      const point = {
        x: minX + ((maxX - minX) * column) / steps,
        y: minY + ((maxY - minY) * row) / steps,
      }
      if (!pointInRegion(point, points, holes)) continue
      const score = clearance(point, points, holes) - dist(point, center) * 0.15
      if (score > bestScore) {
        best = point
        bestScore = score
      }
    }
  }
  return best ?? interiorPoint(points)
}

function clearance(point: Point, outer: Point[], holes: Point[][]): number {
  let gap = ringDistance(point, outer)
  for (const hole of holes) gap = Math.min(gap, ringDistance(point, hole))
  return gap
}

function ringDistance(point: Point, ring: Point[]): number {
  let gap = Infinity
  for (let index = 0; index < ring.length; index++) {
    gap = Math.min(gap, projectSegment(point, ring[index], ring[(index + 1) % ring.length]).distance)
  }
  return gap
}

function span(points: Point[]): number {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    min = Math.min(min, point.x)
    max = Math.max(max, point.x)
  }
  return max - min
}

function ellipsize(text: string, maxPx: number): string {
  if (maxPx <= 8) return ''
  const context = measure()
  if (!context) return text
  context.font = '14px Segoe UI, system-ui, sans-serif'
  if (context.measureText(text).width <= maxPx) return text
  let value = text
  while (value.length > 1 && context.measureText(`${value}…`).width > maxPx) value = value.slice(0, -1)
  return `${value}…`
}

let measureContext: CanvasRenderingContext2D | null = null
function measure() {
  if (measureContext) return measureContext
  measureContext = document.createElement('canvas').getContext('2d')
  return measureContext
}

function viewBounds(view: { panX: number; panY: number; zoom: number }, width: number, height: number) {
  const pad = GRID_STEP
  const x = -view.panX / view.zoom - pad
  const y = -view.panY / view.zoom - pad
  return { x, y, w: width / view.zoom + pad * 2, h: height / view.zoom + pad * 2 }
}
