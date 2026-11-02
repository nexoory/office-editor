import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { objectProbes } from '../geometry/align'
import { ringPoints } from '../geometry/faces'
import { selectionAnchor } from '../geometry/hitTest'
import { wallEnds } from '../geometry/walls'
import { CHAIR_NAME, chairsOf, objectName } from '../objects/catalog'
import { roomIconName } from '../objects/icons'
import { chairPose } from '../objects/placement'
import { theme } from '../theme'
import type { Access, DoorSide, Floor, Hinge, Opening, Point, Selection, View } from '../types'
import { IconPicker } from './IconPicker'
import { ObjectFields, type ObjectFieldActions } from './ObjectFields'

export type InspectorActions = ObjectFieldActions & {
  onDelete: () => void
  onCopy: () => void
  onRotate: () => void
  onThickness: (value: number) => void
  onThicknessWheel: (deltaY: number) => void
  onPartition: (partition: boolean) => void
  onOpening: (kind: 'passage' | 'window') => void
  onOpeningWidth: (value: number) => void
  onOpeningWheel: (deltaY: number, deltaMode: number) => void
  onOpeningKind: (kind: 'passage' | 'door') => void
  onHinge: (hinge: Hinge) => void
  onSide: (side: DoorSide) => void
  onAccess: (access: Access) => void
  onRename: (name: string) => void
  onRoomColor: (color: string | null) => void
  onRoomIcon: (icon: string | null) => void
  onRenameHandled: () => void
}

const GAP_PX = 14
const EDGE_PX = 8

/** Карточка выбора: под ним, а если внизу нет места — над ним, и всегда в пределах холста. */
export function Inspector(props: {
  floor: Floor
  selection: Selection
  view: View
  editing: boolean
  renaming: string | null
  actions: InspectorActions
}) {
  const { floor, selection, editing, actions } = props
  const card = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const box = screenBox(floor, selection, props.view)
  const content = describe(floor, selection, editing, props.renaming, actions)
  const key = selection.kind === 'chair' ? `chair:${selection.chairId}` : `${selection.kind}:${selection.id}`

  useEffect(() => setMenu(false), [key])

  useLayoutEffect(() => {
    const element = card.current
    const stage = element?.offsetParent as HTMLElement | null
    if (!element || !stage || !box) return
    const width = element.offsetWidth
    const height = element.offsetHeight
    const stageW = stage.clientWidth
    const stageH = stage.clientHeight
    let top = box.bottom + GAP_PX
    if (top + height > stageH - EDGE_PX && box.top - GAP_PX - height >= EDGE_PX) top = box.top - GAP_PX - height
    top = Math.max(EDGE_PX, Math.min(stageH - height - EDGE_PX, top))
    const left = Math.max(EDGE_PX, Math.min(stageW - width - EDGE_PX, (box.left + box.right) / 2 - width / 2))
    element.style.left = `${left}px`
    element.style.top = `${top}px`
  })

  if (!box || !content) return null
  const canCopy = editing && selection.kind === 'object'
  return (
    <div ref={card} className="hud inspector" onPointerDown={(event) => event.stopPropagation()}>
      <div className="inspector-head">
        <p className="object-title">{content.title}</p>
        {editing && (
          <div className="inspector-more">
            <button
              type="button"
              className="icon-button"
              aria-label="Действия"
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
            >
              ⋯
            </button>
            {menu && (
              <div className="menu-list inspector-menu" role="menu">
                {canCopy && (
                  <MenuItem label="Копировать" keys="Ctrl+D" onClick={() => { setMenu(false); actions.onCopy() }} />
                )}
                {canCopy && (
                  <MenuItem label="Повернуть на 90°" keys="R" onClick={() => { setMenu(false); actions.onRotate() }} />
                )}
                <MenuItem label="Удалить" keys="Del" danger onClick={() => { setMenu(false); actions.onDelete() }} />
              </div>
            )}
          </div>
        )}
      </div>
      {content.body}
    </div>
  )
}

export function MenuItem(props: {
  label: string
  keys?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role={props.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={props.checked}
      className={props.danger ? 'menu-item danger' : 'menu-item'}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      {props.checked !== undefined && <span className="menu-check">{props.checked ? '✓' : ''}</span>}
      {props.keys && <kbd>{props.keys}</kbd>}
    </button>
  )
}

function describe(
  floor: Floor,
  selection: Selection,
  editing: boolean,
  renaming: string | null,
  actions: InspectorActions,
): { title: string; body: ReactNode } | null {
  if (selection.kind === 'room') {
    const room = floor.rooms.find((item) => item.id === selection.id)
    if (!room) return null
    if (!editing) return room.name ? { title: room.name, body: null } : null
    return {
      title: room.name || 'Помещение',
      body: <RoomSection floor={floor} id={room.id} renaming={renaming === room.id} actions={actions} />,
    }
  }
  if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    if (!object) return null
    return { title: objectName(object.kind), body: <ObjectFields object={object} editing={editing} actions={actions} /> }
  }
  if (!editing) return null
  if (selection.kind === 'chair') return { title: CHAIR_NAME, body: null }
  if (selection.kind === 'vertex') return { title: 'Точка', body: null }
  if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    if (!wall) return null
    return {
      title: wall.thickness > 0 ? 'Стена' : 'Разделитель',
      body: (
        <>
          <NumberStepper
            label="Толщина, см"
            value={wall.thickness}
            step={1}
            onTextFocus={actions.onTextFocus}
            onCommit={actions.onThickness}
            onWheel={(deltaY) => actions.onThicknessWheel(deltaY)}
          />
          <label className="hud-check">
            <input type="checkbox" checked={!!wall.partition} onChange={(event) => actions.onPartition(event.target.checked)} />
            Перегородка
          </label>
          {wall.thickness > 0 && (
            <div className="field">
              <span>Добавить</span>
              <div className="seg">
                <button type="button" onClick={() => actions.onOpening('passage')}>
                  Проход
                </button>
                <button type="button" onClick={() => actions.onOpening('window')}>
                  Окно
                </button>
              </div>
            </div>
          )}
        </>
      ),
    }
  }
  const opening = floor.openings.find((item) => item.id === selection.id)
  if (!opening) return null
  return { title: openingName(opening), body: <OpeningSection opening={opening} actions={actions} /> }
}

function openingName(opening: Opening): string {
  if (opening.kind === 'window') return 'Окно'
  if (opening.kind === 'door') return 'Дверь'
  return 'Проход'
}

function OpeningSection(props: { opening: Opening; actions: InspectorActions }) {
  const { opening, actions } = props
  const hinge = opening.hinge ?? 'start'
  const side = opening.side ?? 'left'
  const access = opening.access ?? 'none'
  return (
    <>
      <NumberStepper
        label="Ширина, см"
        value={opening.width}
        step={5}
        onTextFocus={actions.onTextFocus}
        onCommit={actions.onOpeningWidth}
        onWheel={actions.onOpeningWheel}
      />
      {opening.kind !== 'window' && (
        <div className="field">
          <span>Тип</span>
          <div className="seg" aria-label="Тип проёма">
            <button type="button" aria-pressed={opening.kind === 'passage'} onClick={() => actions.onOpeningKind('passage')}>
              Проход
            </button>
            <button type="button" aria-pressed={opening.kind === 'door'} onClick={() => actions.onOpeningKind('door')}>
              Дверь
            </button>
          </div>
        </div>
      )}
      {opening.kind === 'door' && (
        <>
          <div className="field">
            <span>Створка</span>
            <div className="seg">
              <button type="button" aria-label="Петля у начала" aria-pressed={hinge === 'start'} onClick={() => actions.onHinge('start')}>
                <LeafThumb hinge="start" side={side} />
              </button>
              <button type="button" aria-label="Петля у конца" aria-pressed={hinge === 'end'} onClick={() => actions.onHinge('end')}>
                <LeafThumb hinge="end" side={side} />
              </button>
              <button type="button" aria-label="Створка влево" aria-pressed={side === 'left'} onClick={() => actions.onSide('left')}>
                <LeafThumb hinge={hinge} side="left" />
              </button>
              <button type="button" aria-label="Створка вправо" aria-pressed={side === 'right'} onClick={() => actions.onSide('right')}>
                <LeafThumb hinge={hinge} side="right" />
              </button>
            </div>
          </div>
          <div className="field">
            <span>Доступ</span>
            <div className="seg" aria-label="Доступ">
              <button type="button" aria-pressed={access === 'none'} onClick={() => actions.onAccess('none')}>
                Не закрыта
              </button>
              <button type="button" aria-pressed={access === 'badge'} onClick={() => actions.onAccess('badge')}>
                Пропуск
              </button>
              <button type="button" aria-pressed={access === 'key'} onClick={() => actions.onAccess('key')}>
                Ключ
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/** Число с кнопками шага. Колесо над полем меняет значение и не трогает масштаб холста. */
function NumberStepper(props: {
  label: string
  value: number
  step: number
  onTextFocus: (focused: boolean) => void
  onCommit: (value: number) => void
  onWheel: (deltaY: number, deltaMode: number) => void
}) {
  const shown = String(Math.round(props.value))
  const [draft, setDraft] = useState(shown)
  const revert = useRef(false)
  useEffect(() => setDraft(shown), [shown])
  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="stepper wheel-field" onWheel={(event) => props.onWheel(event.deltaY, event.deltaMode)}>
        <button type="button" aria-label="Меньше" onClick={() => props.onCommit(props.value - props.step)}>
          −
        </button>
        <input
          aria-label={props.label}
          value={draft}
          inputMode="numeric"
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => props.onTextFocus(true)}
          onBlur={() => {
            props.onTextFocus(false)
            if (revert.current) {
              revert.current = false
              setDraft(shown)
              return
            }
            const parsed = Number(draft.trim().replace(',', '.'))
            if (!Number.isFinite(parsed) || draft.trim() === '') {
              setDraft(shown)
              return
            }
            props.onCommit(parsed)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              revert.current = true
              event.currentTarget.blur()
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              props.onCommit(props.value + (event.key === 'ArrowUp' ? props.step : -props.step))
            }
          }}
        />
        <button type="button" aria-label="Больше" onClick={() => props.onCommit(props.value + props.step)}>
          +
        </button>
      </div>
    </div>
  )
}

function LeafThumb(props: { hinge: Hinge; side: DoorSide }) {
  const hingeX = props.hinge === 'start' ? 5 : 23
  const tipX = props.hinge === 'start' ? 18 : 10
  const tipY = props.side === 'left' ? 5 : 23
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
      <line x1={3} y1={14} x2={25} y2={14} stroke="currentColor" strokeWidth={2} />
      <line x1={hingeX} y1={14} x2={tipX} y2={tipY} stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

function RoomSection(props: { floor: Floor; id: string; renaming: boolean; actions: InspectorActions }) {
  const { actions } = props
  const room = props.floor.rooms.find((item) => item.id === props.id)
  const [draft, setDraft] = useState(room?.name ?? '')
  const revert = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => setDraft(room?.name ?? ''), [props.id, room?.name])
  useEffect(() => {
    if (!props.renaming) return
    input.current?.focus()
    input.current?.select()
    actions.onRenameHandled()
  }, [props.renaming, actions])
  if (!room) return null
  const commit = () => {
    if (draft !== room.name) actions.onRename(draft)
  }
  return (
    <>
      <input
        ref={input}
        aria-label="Название помещения"
        value={draft}
        placeholder="Без названия"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => actions.onTextFocus(true)}
        onBlur={() => {
          actions.onTextFocus(false)
          if (revert.current) {
            revert.current = false
            setDraft(room.name)
            return
          }
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            revert.current = true
            event.currentTarget.blur()
          }
        }}
      />
      <IconPicker name={roomIconName(room)} resetLabel="Без иконки" onFocus={actions.onTextFocus} onChange={actions.onRoomIcon} />
      <div className="swatches">
        <button
          type="button"
          className={room.color === null ? 'swatch type-swatch active' : 'swatch type-swatch'}
          aria-label="Без цвета"
          onClick={() => actions.onRoomColor(null)}
        />
        {theme.swatches.map((color) => (
          <button
            key={color}
            type="button"
            className={room.color === color ? 'swatch active' : 'swatch'}
            style={{ background: color }}
            aria-label="Цвет помещения"
            onClick={() => actions.onRoomColor(color)}
          />
        ))}
      </div>
    </>
  )
}

function screenBox(floor: Floor, selection: Selection, view: View) {
  const points = selectionPoints(floor, selection)
  if (points.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const point of points) {
    const sx = point.x * view.zoom + view.panX
    const sy = point.y * view.zoom + view.panY
    left = Math.min(left, sx)
    top = Math.min(top, sy)
    right = Math.max(right, sx)
    bottom = Math.max(bottom, sy)
  }
  return { left, top, right, bottom }
}

function selectionPoints(floor: Floor, selection: Selection): Point[] {
  if (selection.kind === 'room') {
    const room = floor.rooms.find((item) => item.id === selection.id)
    return room ? ringPoints(floor, room.vertexIds) : []
  }
  if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    return object ? objectProbes(object) : []
  }
  if (selection.kind === 'chair') {
    const table = floor.objects.find((item) => item.id === selection.objectId)
    const chair = table && chairsOf(table).find((item) => item.id === selection.chairId)
    return table && chair ? objectProbes(chairPose(table, chair)) : []
  }
  if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    const ends = wall && wallEnds(floor, wall)
    return ends ? [ends.a, ends.b] : []
  }
  const anchor = selectionAnchor(floor, selection)
  return anchor ? [anchor] : []
}
