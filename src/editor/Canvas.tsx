import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import { GRID_STEP } from '../constants'
import type { EditorState, Hover, PointerInfo } from './reduce'
import { activeFloor, cursorFor, ghostFloor } from './reduce'
import { hitMatchesSelection } from '../geometry/hitTest'
import { analyze, sameIds } from '../geometry/faces'
import { floorShape } from '../geometry/roomShape'
import { formatLength } from '../geometry/formatLength'
import { add, left, mul, norm, sub } from '../geometry/math'
import {
  collectAlignRefs,
  geometryProbes,
  matchAlignGuides,
  objectProbes,
  pointAlignRefs,
  type AlignGuide,
} from '../geometry/align'
import {
  alignmentGuides,
  computePreview,
  incidentWallIds,
  labelForWall,
  lengthLabel,
  type Preview,
} from '../geometry/preview'
import { OBJECTS } from '../objects/catalog'
import { roomFill, roomMark, ROOM_MARK_OPACITY, theme } from '../theme'
import type { Floor, Point, RoomMarkPart, Selection } from '../types'
import { wallEnds, wallGraphics, wallLengthOf } from '../geometry/walls'
import { DoorLeaves, FloorObjects, MarkerLayer, ObjectHandles, PlacementGhost } from './figures'
import { chairsOf } from '../objects/catalog'
import { chairPose } from '../objects/placement'
import { FaIcon } from '../objects/faIcon'
import { findIcon } from '../objects/iconList'
import { layoutMarkers } from '../geometry/lod'
import { floorMarks, markRect, titleFont, type Rect, type ResolvedMarks } from '../geometry/roomMarks'

/** Отступ подписи от стен комнаты, в пикселях экрана. */

type Pinch = { distance: number; cx: number; cy: number }

export function Canvas(props: {
  state: EditorState
  editing: boolean
  onPointerDown: (info: PointerInfo) => void
  onPointerMove: (info: PointerInfo) => void
  onPointerUp: (info: PointerInfo) => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onDoubleClick: (info: { sx: number; sy: number }) => void
  onPinch: (info: { sx: number; sy: number; scale: number; dx: number; dy: number }) => void
  onWheel: (info: { sx: number; sy: number; deltaY: number }) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 1, h: 1 })
  const wheel = useRef(props.onWheel)
  wheel.current = props.onWheel
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<Pinch | null>(null)
  /** После щипка оставшийся палец не начинает жест, пока не отпустят все. */
  const pinchLock = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    })
    observer.observe(element)
    const onWheel = (event: WheelEvent) => {
      const origin = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      if (!origin || !element.contains(origin)) {
        // Щипок тачпада над плашкой не должен масштабировать саму страницу.
        if (event.ctrlKey) event.preventDefault()
        return
      }
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      wheel.current({
        sx: event.clientX - rect.left,
        sy: event.clientY - rect.top,
        deltaY: event.deltaY,
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
  const smart = smartOverlay(state, floor, preview)
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
      alt: event.altKey,
      pointerType: event.pointerType,
    }
  }

  const pinchOf = (): Pinch | null => {
    const [a, b] = [...touches.current.values()]
    if (!a || !b) return null
    return { distance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }

  const releaseTouch = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'touch') return false
    touches.current.delete(event.pointerId)
    if (touches.current.size < 2) pinch.current = null
    const locked = pinchLock.current
    if (touches.current.size === 0) pinchLock.current = false
    return locked
  }

  const hover = state.gesture || state.menu ? null : state.hover
  const marks = useMemo(() => floorMarks(floor, analysis.faces), [floor])
  const decorMarks = state.decor ? marks.find((item) => item.roomId === state.decor?.roomId) ?? null : null
  const markerHover = hover?.kind === 'object' ? hover : null
  const markers = useMemo(
    () =>
      layoutMarkers({
        floor,
        zoom,
        selection: state.selection,
        hover: markerHover,
        filter: state.legendFilter,
        obstacles: marks.flatMap((item) => [markRect(item, 'title'), markRect(item, 'badge')]).filter((rect): rect is Rect => !!rect).map((rect) => ({ x0: rect.x0 * zoom, y0: rect.y0 * zoom, x1: rect.x1 * zoom, y1: rect.y1 * zoom })),
      }),
    [floor, zoom, state.selection, markerHover, state.legendFilter, marks],
  )
  const handleObject =
    props.editing && state.tool === 'select' && state.selection?.kind === 'object'
      ? floor.objects.find((item) => state.selection?.kind === 'object' && item.id === state.selection.id) ?? null
      : null
  const busy = !!state.gesture && state.gesture.type !== 'rotate-object' && state.gesture.type !== 'resize-object'

  return (
    <svg
      ref={ref}
      className="plan-canvas"
      style={{ cursor: cursorFor(state, props.editing) }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur()
        if (event.button === 1) event.preventDefault()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // A pointer that is already gone cannot be captured; the gesture still starts.
        }
        const info = locate(event)
        if (event.pointerType === 'touch') {
          touches.current.set(event.pointerId, { x: info.sx, y: info.sy })
          if (touches.current.size >= 2) {
            props.onPointerCancel()
            pinch.current = pinchOf()
            pinchLock.current = true
            return
          }
          if (pinchLock.current) return
        }
        props.onPointerDown(info)
      }}
      onPointerMove={(event) => {
        const info = locate(event)
        if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
          touches.current.set(event.pointerId, { x: info.sx, y: info.sy })
          const previous = pinch.current
          if (previous) {
            const current = pinchOf()
            if (current) {
              props.onPinch({
                sx: previous.cx,
                sy: previous.cy,
                scale: current.distance / previous.distance,
                dx: current.cx - previous.cx,
                dy: current.cy - previous.cy,
              })
              pinch.current = current
            }
            return
          }
          if (pinchLock.current) return
        }
        props.onPointerMove(info)
      }}
      onPointerUp={(event) => {
        if (releaseTouch(event)) return
        props.onPointerUp(locate(event))
      }}
      onPointerCancel={(event) => {
        releaseTouch(event)
        props.onPointerCancel()
      }}
      onPointerLeave={(event) => {
        if (event.buttons === 0) props.onPointerLeave()
      }}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        props.onDoubleClick({ sx: event.clientX - rect.left, sy: event.clientY - rect.top })
      }}
    >
      <g transform={`translate(${state.view.panX} ${state.view.panY}) scale(${zoom})`}>
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.w}
          height={bounds.h}
          fill={theme.canvas}
        />
        {props.editing && <Grid bounds={bounds} zoom={zoom} />}
        {analysis.faces.map((face) => {
          const room = floor.rooms.find((item) => sameIds(item.vertexIds, face.vertexIds))
          if (!room) return null
          const shape = floorShape(floor, face)
          const selected = state.selection?.kind === 'room' && state.selection.id === room.id
          const d = pathOf(shape.outer, shape.holes)
          return (
            <g key={room.id}>
              <path d={d} fill={roomFill(room.color)} fillRule="evenodd" stroke="none" pointerEvents="none" />
              {selected && (
                <path data-export="omit" d={d} fill="none" stroke={theme.selected} strokeWidth={2 / zoom} pointerEvents="none" />
              )}
            </g>
          )
        })}
        {ghost && ghostGraphics && (
          <g data-export="omit" opacity={0.33} pointerEvents="none">
            {ghostGraphics.joins.map((points, index) => (
              <polygon
                key={`gj${index}`}
                points={poly(points)}
                fill={theme.wall}
                stroke={theme.wall}
                strokeWidth={1 / zoom}
                strokeLinejoin="round"
              />
            ))}
            {ghostGraphics.solids.map((solid, index) => (
              <polygon key={`g${index}`} points={poly(solid.points)} fill={theme.wall} />
            ))}
            {ghostGraphics.cuts
              .filter((item) => item.kind === 'window')
              .map((item) => (
                <g key={item.openingId}>
                  <polygon points={poly(item.points)} fill={theme.window} />
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
            <DoorLeaves floor={ghost} zoom={zoom} selectedId={null} />
          </g>
        )}
        <g data-export="omit">
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
        </g>
        <RoomMarks marks={marks} rooms={floor.rooms} />
        <FloorObjects floor={floor} selection={state.selection} editing={props.editing} filter={state.legendFilter} />
        {state.placing?.dragging && (
          <g data-export="omit">
            <PlacementGhost kind={state.placing.kind} x={state.placing.x} y={state.placing.y} zoom={zoom} />
          </g>
        )}
        <g pointerEvents="none">
          {graphics.joins.map((points, index) => (
            <polygon
              key={`join${index}`}
              points={poly(points)}
              fill={theme.wall}
              stroke={theme.wall}
              strokeWidth={1 / zoom}
              strokeLinejoin="round"
            />
          ))}
          {graphics.solids.map((solid, index) => {
            const selected = state.selection?.kind === 'wall' && state.selection.id === solid.wallId
            return (
              <g key={`${solid.wallId}-${index}`}>
                <polygon points={poly(solid.points)} fill={theme.wall} />
                {selected && <polygon data-export="omit" points={poly(solid.points)} fill={theme.selected} />}
              </g>
            )
          })}
          {graphics.cuts.map((item) => {
            const selected = state.selection?.kind === 'opening' && state.selection.id === item.openingId
            return (
            <g key={item.openingId}>
              <polygon points={poly(item.points)} fill={theme.opening} />
              {selected && (
                <polygon data-export="omit" points={poly(item.points)} fill="none" stroke={theme.selected} strokeWidth={2 / zoom} />
              )}
              {item.kind === 'window' && (
                <line
                  x1={item.a.x}
                  y1={item.a.y}
                  x2={item.b.x}
                  y2={item.b.y}
                  stroke={theme.windowLine}
                  strokeWidth={1.2 / zoom}
                />
              )}
            </g>
            )
          })}
          {graphics.dashes.map((dash) => {
            const selected = state.selection?.kind === 'wall' && state.selection.id === dash.wallId
            return (
              <g key={dash.wallId}>
                <line
                  x1={dash.a.x}
                  y1={dash.a.y}
                  x2={dash.b.x}
                  y2={dash.b.y}
                  stroke={theme.wall}
                  strokeWidth={1.4 / zoom}
                  strokeDasharray={`${6 / zoom} ${5 / zoom}`}
                />
                {selected && (
                  <line
                    data-export="omit"
                    x1={dash.a.x}
                    y1={dash.a.y}
                    x2={dash.b.x}
                    y2={dash.b.y}
                    stroke={theme.selected}
                    strokeWidth={1.4 / zoom}
                    strokeDasharray={`${6 / zoom} ${5 / zoom}`}
                  />
                )}
              </g>
            )
          })}
        </g>
        <DoorLeaves floor={floor} zoom={zoom} selectedId={state.selection?.kind === 'opening' ? state.selection.id : null} />
        <MarkerLayer markers={markers} zoom={zoom} />
        {props.editing && (
          <g data-export="omit">
            {floor.vertices.map((vertex) => {
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
          </g>
        )}
        {props.editing && decorMarks && (
          <g data-export="omit">
            <DecorLayer marks={decorMarks} bounds={bounds} part={state.decor?.part ?? null} hover={state.decorHover} zoom={zoom} />
          </g>
        )}
        {hover && (
          <g data-export="omit">
            <HoverOutline floor={floor} analysis={analysis} hover={hover} selection={state.selection} zoom={zoom} />
          </g>
        )}
        {handleObject && !busy && (
          <g data-export="omit">
            <ObjectHandles object={handleObject} zoom={zoom} active={hover?.kind === 'handle' ? hover.handle : null} />
          </g>
        )}
        <g data-export="omit">
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
        <SmartGuides guides={smart} zoom={zoom} />
        {[
          ...labels,
          ...(selectedWallLabel(state, floor, props.editing) ? [selectedWallLabel(state, floor, props.editing)!] : []),
          ...(preview && preview.length >= 0.01 ? [lengthLabel(preview.start, preview.end, zoom, formatLength(preview.length))] : []),
        ].map(
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
      </g>
    </svg>
  )
}

function footprintPoints(pose: { x: number; y: number; rotation: number; length: number; width: number }, pad: number): string {
  const hx = pose.length / 2 + pad
  const hy = pose.width / 2 + pad
  const c = Math.cos(pose.rotation)
  const s = Math.sin(pose.rotation)
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ]
    .map(([x, y]) => `${pose.x + x * c - y * s},${pose.y + x * s + y * c}`)
    .join(' ')
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
    <g data-export="omit" stroke={theme.grid} strokeWidth={1 / zoom} pointerEvents="none">
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

function SmartGuides(props: { guides: AlignGuide[]; zoom: number }) {
  const { guides, zoom } = props
  if (guides.length === 0) return null
  return (
    <g pointerEvents="none">
      {guides.map((guide, index) => {
        const across = guide.axis === 'y'
        const x1 = across ? guide.from : guide.value
        const x2 = across ? guide.to : guide.value
        const y1 = across ? guide.value : guide.from
        const y2 = across ? guide.value : guide.to
        return (
          <g key={`smart${index}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={theme.canvas} strokeWidth={3.2 / zoom} />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={theme.smart}
              strokeWidth={1.25 / zoom}
              strokeDasharray={`${5 / zoom} ${4 / zoom}`}
            />
          </g>
        )
      })}
    </g>
  )
}

function HoverOutline(props: {
  floor: Floor
  analysis: ReturnType<typeof analyze>
  hover: Hover
  selection: Selection | null
  zoom: number
}) {
  const { floor, hover, zoom } = props
  if (hover.kind === 'handle' || hover.kind === 'empty') return null
  if (hitMatchesSelection(hover, props.selection)) return null
  const stroke = theme.hover
  const width = 2 / zoom
  if (hover.kind === 'vertex') {
    const vertex = floor.vertices.find((item) => item.id === hover.id)
    if (!vertex) return null
    return <circle cx={vertex.x} cy={vertex.y} r={7 / zoom} fill="none" stroke={stroke} strokeWidth={width} pointerEvents="none" />
  }
  if (hover.kind === 'wall' || hover.kind === 'opening') {
    const opening = hover.kind === 'opening' ? floor.openings.find((item) => item.id === hover.id) : null
    const wall = floor.walls.find((item) => item.id === (opening ? opening.wallId : hover.id))
    const ends = wall && wallEnds(floor, wall)
    if (!wall || !ends) return null
    const along = norm(sub(ends.b, ends.a))
    const a = opening ? add(ends.a, mul(along, opening.offset)) : ends.a
    const b = opening ? add(ends.a, mul(along, opening.offset + opening.width)) : ends.b
    return (
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeOpacity={0.4}
        strokeWidth={wall.thickness + 6 / zoom}
        pointerEvents="none"
      />
    )
  }
  if (hover.kind === 'object' || hover.kind === 'chair') {
    const object = floor.objects.find((item) => item.id === (hover.kind === 'chair' ? hover.objectId : hover.id))
    if (!object) return null
    const chair = hover.kind === 'chair' ? chairsOf(object).find((item) => item.id === hover.chairId) : null
    const pose = chair ? chairPose(object, chair) : object
    return (
      <polygon points={footprintPoints(pose, 2 / zoom)} fill="none" stroke={stroke} strokeWidth={width} pointerEvents="none" />
    )
  }
  const room = floor.rooms.find((item) => item.id === hover.id)
  const face = room && props.analysis.faces.find((item) => sameIds(item.vertexIds, room.vertexIds))
  if (!face) return null
  const shape = floorShape(floor, face)
  return (
    <path
      d={pathOf(shape.outer, shape.holes)}
      fill={stroke}
      fillOpacity={0.06}
      fillRule="evenodd"
      stroke={stroke}
      strokeOpacity={0.5}
      strokeWidth={width}
      pointerEvents="none"
    />
  )
}

function smartOverlay(state: EditorState, floor: Floor, preview: Preview | null): AlignGuide[] {
  const zoom = state.view.zoom
  if (state.cursor?.alt) return []
  if (state.placing?.dragging) {
    const spec = OBJECTS[state.placing.kind]
    return matchAlignGuides(
      objectProbes({
        x: state.placing.x,
        y: state.placing.y,
        rotation: 0,
        length: spec.length,
        width: spec.width,
      }),
      collectAlignRefs(floor, [], []),
      zoom,
    )
  }
  const gesture = state.gesture
  if (gesture?.type === 'move-object') {
    const object = floor.objects.find((item) => item.id === gesture.id)
    if (!object) return []
    return matchAlignGuides(objectProbes(object), collectAlignRefs(floor, [], [object.id]), zoom)
  }
  if (gesture?.type === 'move-vertex') return guidesForVertices(floor, [gesture.id], zoom)
  if (gesture?.type === 'move-wall') return guidesForVertices(floor, wallVertexIds(floor, gesture.id), zoom)
  if (gesture?.type === 'move-room') return guidesForVertices(floor, gesture.vertexIds, zoom)
  if (preview && preview.length * zoom >= 8) {
    const refs = [
      ...collectAlignRefs(floor, [], []),
      ...pointAlignRefs([preview.start, ...(state.chain ?? [])]),
    ]
    return matchAlignGuides([preview.end], refs, zoom)
  }
  return []
}

function guidesForVertices(floor: Floor, vertexIds: string[], zoom: number): AlignGuide[] {
  if (vertexIds.length === 0) return []
  return matchAlignGuides(geometryProbes(floor, vertexIds), collectAlignRefs(floor, vertexIds, []), zoom)
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
    free: raw.alt,
  }).preview
}

function selectedWallLabel(state: EditorState, floor: Floor, editing: boolean) {
  const selection = state.selection
  if (!editing || selection?.kind !== 'wall') return null
  if (state.gesture?.type === 'move-wall' || state.gesture?.type === 'move-vertex') return null
  const wall = floor.walls.find((item) => item.id === selection.id)
  const ends = wall && wallEnds(floor, wall)
  if (!wall || !ends) return null
  // Плашка висит ниже середины. Подпись поднимается над телом стены, чтобы не попасть под неё.
  const lift = wall.thickness / 2 + 18 / state.view.zoom
  return {
    x: (ends.a.x + ends.b.x) / 2,
    y: (ends.a.y + ends.b.y) / 2 - lift,
    text: formatLength(wallLengthOf(floor, wall)),
  }
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

/** Название и знак лежат на полу: размеры плана, цвет комнаты, обрезка по её контуру. */
function RoomMarks(props: { marks: ResolvedMarks[]; rooms: Floor['rooms'] }) {
  return (
    <g pointerEvents="none" opacity={ROOM_MARK_OPACITY}>
      {props.marks.map((item) => {
        const room = props.rooms.find((entry) => entry.id === item.roomId)
        const ink = roomMark(room?.color ?? null)
        const icon = item.badge ? findIcon(item.icon ?? undefined) : undefined
        const clip = `room-clip-${item.roomId}`
        return (
          <g key={item.roomId}>
            <clipPath id={clip}>
              <path d={pathOf(item.outer, item.holes)} clipRule="evenodd" />
            </clipPath>
            <g clipPath={`url(#${clip})`}>
              {icon && item.badge && (
                <g transform={`translate(${item.badge.x} ${item.badge.y})`}>
                  <FaIcon icon={icon} size={item.badge.size} color={ink} />
                </g>
              )}
              {item.title && (
                <text
                  x={item.title.x}
                  y={item.title.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={ink}
                  style={{ font: titleFont(item.title.size) }}
                >
                  {item.name}
                </text>
              )}
            </g>
          </g>
        )
      })}
    </g>
  )
}

/** Оформление: всё вне комнаты притушено, у надписей рамки, у выбранной — углы размера. */
function DecorLayer(props: {
  marks: ResolvedMarks
  bounds: { x: number; y: number; w: number; h: number }
  part: RoomMarkPart | null
  hover: RoomMarkPart | 'handle' | null
  zoom: number
}) {
  const { marks, bounds, zoom } = props
  const room = pathOf(marks.outer, marks.holes)
  const handle = 8 / zoom
  return (
    <g pointerEvents="none">
      <path
        d={`M${bounds.x} ${bounds.y}h${bounds.w}v${bounds.h}h${-bounds.w}Z ${room}`}
        fill={theme.canvas}
        fillOpacity={0.72}
        fillRule="evenodd"
      />
      <path d={room} fill="none" stroke={theme.selected} strokeWidth={2 / zoom} />
      {(['badge', 'title'] as const).map((part) => {
        const rect = markRect(marks, part)
        if (!rect) return null
        const active = props.part === part
        const corners = [
          [rect.x0, rect.y0],
          [rect.x1, rect.y0],
          [rect.x1, rect.y1],
          [rect.x0, rect.y1],
        ]
        return (
          <g key={part}>
            <rect
              x={rect.x0}
              y={rect.y0}
              width={rect.x1 - rect.x0}
              height={rect.y1 - rect.y0}
              fill="none"
              stroke={theme.selected}
              strokeOpacity={active || props.hover === part ? 1 : 0.55}
              strokeWidth={(active ? 1.5 : 1) / zoom}
              strokeDasharray={active ? undefined : `${4 / zoom} ${3 / zoom}`}
            />
            {active &&
              corners.map(([x, y], index) => (
                <rect
                  key={index}
                  x={x - handle / 2}
                  y={y - handle / 2}
                  width={handle}
                  height={handle}
                  rx={1.5 / zoom}
                  fill="#fff"
                  stroke={theme.selected}
                  strokeWidth={1.5 / zoom}
                />
              ))}
          </g>
        )
      })}
    </g>
  )
}

function viewBounds(view: { panX: number; panY: number; zoom: number }, width: number, height: number) {
  const pad = GRID_STEP
  const x = -view.panX / view.zoom - pad
  const y = -view.panY / view.zoom - pad
  return { x, y, w: width / view.zoom + pad * 2, h: height / view.zoom + pad * 2 }
}
