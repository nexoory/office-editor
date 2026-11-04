import {
  faArrowsLeftRight,
  faChair,
  faCircleDot,
  faCopy,
  faDoorOpen,
  faEllipsis,
  faPaintbrush,
  faRotateLeft,
  faGripLines,
  faRotateRight,
  faRulerHorizontal,
  faTrashCan,
  faBorderAll,
  faWindowMaximize,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { UNITS_PER_METER } from '../constants'
import { objectProbes } from '../geometry/align'
import { analyze, ringPoints, sameIds } from '../geometry/faces'
import { formatLength, formatMeters } from '../geometry/formatLength'
import { selectionAnchor } from '../geometry/hitTest'
import { floorArea, floorShape } from '../geometry/roomShape'
import { marksOf } from '../geometry/roomMarks'
import { wallEnds, wallLengthOf } from '../geometry/walls'
import { CATEGORY_NAME, CHAIR_NAME, categoryOf, chairsOf, interestDisplayName, objectName } from '../objects/catalog'
import { RoomGlyph, roomIconName } from '../objects/icons'
import { accessLook, MarkerIcon, objectLook } from '../objects/markers'
import { chairPose } from '../objects/placement'
import { roomFill, roomInk, theme } from '../theme'
import type { Access, DoorSide, Floor, Hinge, Opening, Point, RoomMarkPart, Selection, View } from '../types'
import { Glyph } from './Glyph'
import { IconSelect } from './IconPicker'
import { ObjectFields, type ObjectFieldActions } from './ObjectFields'
import { Button, IconButton } from './ui/Button'
import { Field, NumberField, Switch, TextField } from './ui/Field'
import { MenuItem, MenuSeparator } from './ui/Menu'
import { Segmented } from './ui/Segmented'
import { Sheet } from './ui/Sheet'
import { Swatches } from './ui/Swatches'

export type InspectorActions = ObjectFieldActions & {
  onDelete: () => void
  onCopy: () => void
  onRotate: () => void
  onClose: () => void
  /** Шторка закрыла выбор: холст сдвигается на столько пикселей по вертикали. */
  onReveal: (dy: number) => void
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
  onDecor: () => void
  onDecorDone: () => void
  onMarkSize: (part: RoomMarkPart, size: number) => void
  onMarkReset: () => void
  onRenameHandled: () => void
}

const GAP_PX = 14
const EDGE_PX = 8
/** Над шторкой выбор держится с таким запасом. */
const REVEAL_PX = 24

type Content = { mark: ReactNode; title: ReactNode; subtitle?: string; body: ReactNode }

/**
 * Карточка выбора. На большом экране — у выбора: под ним, а если внизу нет места — над ним.
 * В шторке — во всю ширину внизу, и холст уводит выбор из-под неё.
 */
export function Inspector(props: {
  floor: Floor
  selection: Selection
  view: View
  editing: boolean
  sheet: boolean
  renaming: string | null
  decor: { roomId: string } | null
  actions: InspectorActions
}) {
  const { floor, selection, editing, actions } = props
  const card = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const revealed = useRef<string | null>(null)
  const box = screenBox(floor, selection, props.view)
  const content = describe(floor, selection, editing, props.renaming, props.decor, actions)
  const key = selection.kind === 'chair' ? `chair:${selection.chairId}` : `${selection.kind}:${selection.id}`

  useEffect(() => setMenu(false), [key])

  useLayoutEffect(() => {
    const element = card.current
    const stage = element?.closest('.stage') as HTMLElement | null
    if (!element || !stage || !box) return
    const stageH = stage.clientHeight
    if (props.sheet) {
      element.style.left = ''
      element.style.top = ''
      if (revealed.current === key) return
      revealed.current = key
      const sheetTop = stageH - element.offsetHeight
      if (box.bottom > sheetTop - REVEAL_PX) actions.onReveal(sheetTop / 2 - (box.top + box.bottom) / 2)
      return
    }
    const width = element.offsetWidth
    const height = element.offsetHeight
    const stageW = stage.clientWidth
    let top = box.bottom + GAP_PX
    if (top + height > stageH - EDGE_PX && box.top - GAP_PX - height >= EDGE_PX) top = box.top - GAP_PX - height
    top = Math.max(EDGE_PX, Math.min(stageH - height - EDGE_PX, top))
    const left = Math.max(EDGE_PX, Math.min(stageW - width - EDGE_PX, (box.left + box.right) / 2 - width / 2))
    element.style.left = `${left}px`
    element.style.top = `${top}px`
  })

  if (!box || !content) return null
  const canCopy = editing && selection.kind === 'object'
  const inner = (
    <>
      <header className="card-head">
        <span className="card-mark">{content.mark}</span>
        <div className="card-titles">
          {typeof content.title === 'string' ? <p className="card-title">{content.title}</p> : content.title}
          {content.subtitle && <p className="card-sub">{content.subtitle}</p>}
        </div>
        {props.decor ? (
          <IconButton icon={faXmark} label="Готово" onClick={actions.onDecorDone} />
        ) : editing ? (
          <div className="card-more">
            <IconButton icon={faEllipsis} label="Действия" expanded={menu} onClick={() => setMenu((open) => !open)} />
            {menu && (
              <div className="panel menu card-menu" role="menu">
                {canCopy && (
                  <MenuItem icon={faCopy} label="Копировать" keys="Ctrl+D" onClick={() => { setMenu(false); actions.onCopy() }} />
                )}
                {canCopy && (
                  <MenuItem icon={faRotateRight} label="Повернуть на 90°" keys="R" onClick={() => { setMenu(false); actions.onRotate() }} />
                )}
                {canCopy && <MenuSeparator />}
                <MenuItem icon={faTrashCan} label="Удалить" keys="Del" danger onClick={() => { setMenu(false); actions.onDelete() }} />
              </div>
            )}
          </div>
        ) : (
          <IconButton icon={faXmark} label="Закрыть" onClick={actions.onClose} />
        )}
      </header>
      {content.body && <div className="card-body">{content.body}</div>}
    </>
  )
  if (props.sheet) {
    return (
      <Sheet ref={card} label={typeof content.title === 'string' ? content.title : 'Свойства'} className="card">
        {inner}
      </Sheet>
    )
  }
  return (
    <div ref={card} className="panel card inspector" onPointerDown={(event) => event.stopPropagation()}>
      {inner}
    </div>
  )
}

function SymbolMark(props: { icon: IconDefinition }) {
  return (
    <span className="card-symbol">
      <Glyph icon={props.icon} size={13} />
    </span>
  )
}

function describe(
  floor: Floor,
  selection: Selection,
  editing: boolean,
  renaming: string | null,
  decor: { roomId: string } | null,
  actions: InspectorActions,
): Content | null {
  if (selection.kind === 'room') {
    const room = floor.rooms.find((item) => item.id === selection.id)
    if (!room) return null
    if (!editing && !room.name) return null
    const icon = roomIconName(room)
    const mark = (
      <span className="card-symbol" style={{ background: roomFill(room.color), color: roomInk(room.color) }}>
        {icon ? <RoomGlyph name={icon} size={14} color="currentColor" /> : <Glyph icon={faBorderAll} size={13} />}
      </span>
    )
    const subtitle = roomArea(floor, room.vertexIds)
    if (!editing) return { mark, title: room.name, subtitle, body: null }
    if (decor?.roomId === room.id) {
      const marks = marksOf(floor, room.id)
      return {
        mark,
        title: room.name.trim() || 'Без названия',
        subtitle: 'Надпись на полу',
        body: (
          <section className="card-group">
            {marks?.title && (
              <Field label="Название">
                <NumberField
                  label="Кегль названия"
                  unit="см"
                  value={marks.title.size}
                  step={1}
                  format={(value) => String(Math.round(value))}
                  parse={parseNumber}
                  onFocus={actions.onTextFocus}
                  onCommit={(value) => actions.onMarkSize('title', value)}
                />
              </Field>
            )}
            {marks?.badge && (
              <Field label="Знак">
                <NumberField
                  label="Размер знака"
                  unit="см"
                  value={marks.badge.size}
                  step={1}
                  format={(value) => String(Math.round(value))}
                  parse={parseNumber}
                  onFocus={actions.onTextFocus}
                  onCommit={(value) => actions.onMarkSize('badge', value)}
                />
              </Field>
            )}
            <div className="card-actions">
              <Button icon={faRotateLeft} variant="ghost" disabled={!room.title && !room.badge} onClick={actions.onMarkReset}>
                По умолчанию
              </Button>
              <Button variant="primary" onClick={actions.onDecorDone}>
                Готово
              </Button>
            </div>
          </section>
        ),
      }
    }
    return {
      mark,
      title: <RoomTitle name={room.name} id={room.id} renaming={renaming === room.id} actions={actions} />,
      subtitle,
      body: (
        <section className="card-group">
          <Field label="Иконка">
            <IconSelect name={icon} resetLabel="Без иконки" emptyLabel="Без иконки" onFocus={actions.onTextFocus} onChange={actions.onRoomIcon} />
          </Field>
          <Field label="Цвет">
            <Swatches
              label="Цвет помещения"
              value={room.color}
              colors={theme.roomSwatches}
              resetLabel="Без цвета"
              onChange={actions.onRoomColor}
            />
          </Field>
          <Field label="Надпись">
            <Button icon={faPaintbrush} disabled={!room.name.trim() && !icon} onClick={actions.onDecor}>
              Расположить
            </Button>
          </Field>
        </section>
      ),
    }
  }
  if (selection.kind === 'object') {
    const object = floor.objects.find((item) => item.id === selection.id)
    if (!object) return null
    const title = object.kind === 'interest' ? interestDisplayName(object.name) : objectName(object.kind)
    const category = CATEGORY_NAME[categoryOf(object.kind)]
    return {
      mark: <MarkerIcon look={objectLook(object)} size={28} />,
      title,
      subtitle: editing
        ? `${formatMeters(object.length)} × ${formatMeters(object.width)} м`
        : category === title
          ? undefined
          : category,
      body: <ObjectFields object={object} editing={editing} actions={actions} />,
    }
  }
  if (!editing) return null
  if (selection.kind === 'chair') return { mark: <SymbolMark icon={faChair} />, title: CHAIR_NAME, body: null }
  if (selection.kind === 'vertex') return { mark: <SymbolMark icon={faCircleDot} />, title: 'Точка', body: null }
  if (selection.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === selection.id)
    if (!wall) return null
    return {
      mark: <SymbolMark icon={wall.thickness > 0 ? faRulerHorizontal : faGripLines} />,
      title: wall.thickness > 0 ? 'Стена' : 'Разделитель',
      subtitle: formatLength(wallLengthOf(floor, wall)),
      body: (
        <section className="card-group">
          <Field label="Толщина">
            <NumberField
              label="Толщина"
              unit="см"
              value={wall.thickness}
              step={1}
              format={(value) => String(Math.round(value))}
              parse={parseNumber}
              onFocus={actions.onTextFocus}
              onCommit={actions.onThickness}
              onWheel={(deltaY) => actions.onThicknessWheel(deltaY)}
            />
          </Field>
          <Field label="Перегородка">
            <Switch label="Перегородка" checked={!!wall.partition} onChange={actions.onPartition} />
          </Field>
          {wall.thickness > 0 && (
            <Field label="Добавить">
              <div className="row">
                <Button icon={faArrowsLeftRight} onClick={() => actions.onOpening('passage')}>
                  Проход
                </Button>
                <Button icon={faWindowMaximize} onClick={() => actions.onOpening('window')}>
                  Окно
                </Button>
              </div>
            </Field>
          )}
        </section>
      ),
    }
  }
  const opening = floor.openings.find((item) => item.id === selection.id)
  if (!opening) return null
  return {
    mark: <SymbolMark icon={opening.kind === 'window' ? faWindowMaximize : opening.kind === 'door' ? faDoorOpen : faArrowsLeftRight} />,
    title: openingName(opening),
    subtitle: formatLength(opening.width),
    body: <OpeningSection opening={opening} actions={actions} />,
  }
}

function parseNumber(text: string): number | null {
  const parsed = Number(text.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function roomArea(floor: Floor, vertexIds: string[]): string | undefined {
  const face = analyze(floor).faces.find((item) => sameIds(item.vertexIds, vertexIds))
  if (!face) return undefined
  const meters = floorArea(floorShape(floor, face)) / (UNITS_PER_METER * UNITS_PER_METER)
  return `${meters.toFixed(1).replace('.', ',')} м²`
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
    <section className="card-group">
      <Field label="Ширина">
        <NumberField
          label="Ширина"
          unit="см"
          value={opening.width}
          step={5}
          format={(value) => String(Math.round(value))}
          parse={parseNumber}
          onFocus={actions.onTextFocus}
          onCommit={actions.onOpeningWidth}
          onWheel={actions.onOpeningWheel}
        />
      </Field>
      {opening.kind !== 'window' && (
        <Field label="Тип">
          <Segmented
            label="Тип проёма"
            value={opening.kind === 'door' ? 'door' : 'passage'}
            options={[
              { value: 'passage', label: 'Проход' },
              { value: 'door', label: 'Дверь' },
            ]}
            onChange={actions.onOpeningKind}
          />
        </Field>
      )}
      {opening.kind === 'door' && (
        <>
          <Field label="Петля">
            <Segmented
              label="Петля"
              value={hinge}
              options={[
                { value: 'start', aria: 'Петля у начала', label: <LeafThumb hinge="start" side={side} /> },
                { value: 'end', aria: 'Петля у конца', label: <LeafThumb hinge="end" side={side} /> },
              ]}
              onChange={actions.onHinge}
            />
          </Field>
          <Field label="Створка">
            <Segmented
              label="Створка"
              value={side}
              options={[
                { value: 'left', aria: 'Створка влево', label: <LeafThumb hinge={hinge} side="left" /> },
                { value: 'right', aria: 'Створка вправо', label: <LeafThumb hinge={hinge} side="right" /> },
              ]}
              onChange={actions.onSide}
            />
          </Field>
          <Field label="Доступ">
            <Segmented
              label="Доступ"
              value={access}
              options={[
                { value: 'none', label: 'Свободно' },
                { value: 'badge', label: <><MarkerIcon look={accessLook('badge')} size={14} /> Пропуск</> },
                { value: 'key', label: <><MarkerIcon look={accessLook('key')} size={14} /> Ключ</> },
              ]}
              onChange={actions.onAccess}
            />
          </Field>
        </>
      )}
    </section>
  )
}

function LeafThumb(props: { hinge: Hinge; side: DoorSide }) {
  const hingeX = props.hinge === 'start' ? 4 : 16
  const tipX = props.hinge === 'start' ? 13 : 7
  const tipY = props.side === 'left' ? 3 : 17
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
      <line x1={2} y1={10} x2={18} y2={10} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={hingeX} y1={10} x2={tipX} y2={tipY} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

/** Название комнаты правится прямо в заголовке. Двойной клик и Enter ставят сюда курсор. */
function RoomTitle(props: { name: string; id: string; renaming: boolean; actions: InspectorActions }) {
  const { actions } = props
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!props.renaming) return
    input.current?.focus()
    input.current?.select()
    actions.onRenameHandled()
  }, [props.renaming, actions])
  return (
    <TextField
      key={props.id}
      inputRef={input}
      className="input-title"
      label="Название помещения"
      value={props.name}
      placeholder="Помещение"
      onFocus={actions.onTextFocus}
      onCommit={actions.onRename}
    />
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
