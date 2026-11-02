import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { faArrowsRotate, faUpRightAndDownLeftFromCenter } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { formatMeters, parseMeters } from '../geometry/formatLength'
import { selectionAnchor } from '../geometry/hitTest'
import { FaIcon } from '../objects/faIcon'
import { localToWorld } from '../objects/placement'
import {
  CHAIR_FIELDS,
  CHAIR_NAME,
  OBJECT_FIELDS,
  chairsOf,
  objectName,
  typeSymbol,
  visibleFields,
} from '../objects/catalog'
import { theme } from '../theme'
import type { Floor, PlanObject, Selection, StairDirection, View } from '../types'
import { IconPicker } from './IconPicker'
import type { PointerInfo } from './reduce'

export function ObjectHud(props: {
  floor: Floor
  selection: Selection
  view: View
  editing: boolean
  onTextFocus: (focused: boolean) => void
  onNote: (id: string, note: string) => void
  onAddTag: (id: string, tag: string) => void
  onRemoveTag: (id: string, tag: string) => void
  onColor: (id: string, color: string | null) => void
  onSymbol: (id: string, symbol: string | null) => void
  onLength: (id: string, length: number) => void
  onWidth: (id: string, width: number) => void
  onStep: (id: string, step: number) => void
  onDirection: (id: string, direction: StairDirection) => void
  onAddChair: (id: string) => void
  onSelectChair: (objectId: string, chairId: string) => void
  onCopy: (id: string) => void
  onDelete: () => void
  stageRef: RefObject<HTMLDivElement | null>
  onHandleDown: (kind: 'rotate' | 'resize', info: PointerInfo) => void
  onHandleMove: (info: PointerInfo) => void
  onHandleUp: (info: PointerInfo) => void
}) {
  const selection = props.selection
  if (selection.kind !== 'object' && selection.kind !== 'chair') return null
  const anchor = selectionAnchor(props.floor, selection)
  const selectedObject = props.floor.objects.find((item) => item.id === (selection.kind === 'object' ? selection.id : selection.objectId))
  const selectedChair =
    selection.kind === 'chair' && selectedObject
      ? chairsOf(selectedObject).find((item) => item.id === selection.chairId)
      : undefined
  if (!anchor || !selectedObject) return null
  const fields = selectedChair
    ? visibleFields(CHAIR_FIELDS, props.editing)
    : visibleFields(OBJECT_FIELDS, props.editing, selectedObject.kind)
  const at =
    selection.kind === 'object'
      ? localToWorld(selectedObject, { x: -selectedObject.length / 2, y: -selectedObject.width / 2 })
      : anchor
  const left = at.x * props.view.zoom + props.view.panX
  const top = at.y * props.view.zoom + props.view.panY
  const locate = (event: ReactPointerEvent): PointerInfo => {
    const rect = props.stageRef.current?.getBoundingClientRect()
    return {
      button: event.button,
      sx: event.clientX - (rect?.left ?? 0),
      sy: event.clientY - (rect?.top ?? 0),
      shift: event.shiftKey,
    }
  }
  const body = fields.map((field) => {
        if (field.id === 'typeName') {
          return (
            <p key={field.id} className="object-title">
              {selectedChair ? CHAIR_NAME : objectName(selectedObject.kind)}
            </p>
          )
        }
        if (field.id === 'note' && !selectedChair) {
          return (
            <NoteField
              key={field.id}
              note={selectedObject.note}
              editing={props.editing}
              onFocus={props.onTextFocus}
              onCommit={(note) => props.onNote(selectedObject.id, note)}
            />
          )
        }
        if (field.id === 'tags' && !selectedChair) {
          return (
            <TagField
              key={field.id}
              tags={selectedObject.tags}
              editing={props.editing}
              onFocus={props.onTextFocus}
              onAdd={(tag) => props.onAddTag(selectedObject.id, tag)}
              onRemove={(tag) => props.onRemoveTag(selectedObject.id, tag)}
            />
          )
        }
        if (field.id === 'symbol' && props.editing && !selectedChair) {
          return (
            <div key={field.id} className="field">
              <span>Иконка</span>
              <IconPicker
                name={selectedObject.symbol ?? typeSymbol(selectedObject.kind)}
                resetLabel="Иконка типа"
                onFocus={props.onTextFocus}
                onChange={(symbol) => props.onSymbol(selectedObject.id, symbol)}
              />
            </div>
          )
        }
        if (field.id === 'color' && props.editing && !selectedChair) {
          return (
            <div key={field.id} className="field">
              <span>Цвет</span>
              <div className="swatches">
                <button
                  type="button"
                  className={selectedObject.color === null ? 'swatch type-swatch active' : 'swatch type-swatch'}
                  aria-label="Цвет типа"
                  onClick={() => props.onColor(selectedObject.id, null)}
                />
                {theme.swatches.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={selectedObject.color === color ? 'swatch active' : 'swatch'}
                    style={{ background: color }}
                    aria-label="Цвет объекта"
                    onClick={() => props.onColor(selectedObject.id, color)}
                  />
                ))}
              </div>
            </div>
          )
        }
        if (field.id === 'length' && props.editing && !selectedChair) {
          return (
            <MeterField
              key={`length-${selectedObject.id}`}
              label="Длина"
              value={selectedObject.length}
              onFocus={props.onTextFocus}
              onCommit={(value) => props.onLength(selectedObject.id, value)}
            />
          )
        }
        if (field.id === 'width' && props.editing && !selectedChair) {
          return (
            <MeterField
              key={`width-${selectedObject.id}`}
              label="Ширина"
              value={selectedObject.width}
              onFocus={props.onTextFocus}
              onCommit={(value) => props.onWidth(selectedObject.id, value)}
            />
          )
        }
        if (field.id === 'step' && props.editing && !selectedChair) {
          return (
            <MeterField
              key={`step-${selectedObject.id}`}
              label="Шаг"
              value={selectedObject.step ?? selectedObject.length}
              onFocus={props.onTextFocus}
              onCommit={(value) => props.onStep(selectedObject.id, value)}
            />
          )
        }
        if (field.id === 'direction' && props.editing && !selectedChair) {
          const direction = selectedObject.direction ?? 'up'
          return (
            <div key={field.id} className="field">
              <span>Направление</span>
              <div className="seg">
                <button type="button" aria-pressed={direction === 'up'} onClick={() => props.onDirection(selectedObject.id, 'up')}>
                  Вверх
                </button>
                <button type="button" aria-pressed={direction === 'down'} onClick={() => props.onDirection(selectedObject.id, 'down')}>
                  Вниз
                </button>
              </div>
            </div>
          )
        }
        if (field.id === 'chairs' && props.editing && !selectedChair && selectedObject.kind === 'table') {
          return (
            <ChairList
              key={field.id}
              object={selectedObject}
              onAdd={() => props.onAddChair(selectedObject.id)}
              onSelect={(chairId) => props.onSelectChair(selectedObject.id, chairId)}
            />
          )
        }
        if (field.id === 'copy' && props.editing && !selectedChair) {
          return (
            <button key={field.id} type="button" className="text-button" onClick={() => props.onCopy(selectedObject.id)}>
              Копировать
            </button>
          )
        }
        if (field.id === 'remove' && props.editing) {
          return (
            <button key={field.id} type="button" className="text-button" onClick={props.onDelete}>
              Удалить
            </button>
          )
        }
        return null
      })
  if (selection.kind !== 'object') {
    return (
      <div className="hud hud-stack" style={{ left, top, transform: 'translate(-50%, 12px)' }}>
        {body}
      </div>
    )
  }
  return (
    <div className="hud-object" style={{ left, top }}>
      <div className="hud hud-stack">{body}</div>
      {props.editing && (
        <div className="object-handles">
          <HandleButton
            label="Повернуть"
            icon={faArrowsRotate}
            onDown={(event) => props.onHandleDown('rotate', locate(event))}
            onMove={(event) => props.onHandleMove(locate(event))}
            onUp={(event) => props.onHandleUp(locate(event))}
          />
          <HandleButton
            label="Изменить размер"
            icon={faUpRightAndDownLeftFromCenter}
            onDown={(event) => props.onHandleDown('resize', locate(event))}
            onMove={(event) => props.onHandleMove(locate(event))}
            onUp={(event) => props.onHandleUp(locate(event))}
          />
        </div>
      )}
    </div>
  )
}

function HandleButton(props: {
  label: string
  icon: IconDefinition
  onDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        props.onDown(event)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        props.onMove(event)
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        props.onUp(event)
      }}
      onPointerCancel={(event) => props.onUp(event)}
    >
      <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
        <FaIcon icon={props.icon} size={16} color="currentColor" />
      </svg>
    </button>
  )
}

function ChairList(props: { object: PlanObject; onAdd: () => void; onSelect: (chairId: string) => void }) {
  const chairs = chairsOf(props.object)
  return (
    <div className="field">
      <span>Кресла</span>
      {chairs.map((chair, index) => (
        <button key={chair.id} type="button" className="text-button" onClick={() => props.onSelect(chair.id)}>
          {CHAIR_NAME} {index + 1}
        </button>
      ))}
      <button type="button" className="text-button" onClick={props.onAdd}>
        Добавить кресло
      </button>
    </div>
  )
}

function NoteField(props: {
  note: string
  editing: boolean
  onFocus: (focused: boolean) => void
  onCommit: (note: string) => void
}) {
  const [draft, setDraft] = useState(props.note)
  const revert = useRef(false)
  useEffect(() => setDraft(props.note), [props.note])
  if (!props.editing) {
    return (
      <div className="field">
        <span>Описание</span>
        <p className="readonly">{props.note}</p>
      </div>
    )
  }
  return (
    <label className="field">
      <span>Описание</span>
      <input
        aria-label="Описание"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => props.onFocus(true)}
        onBlur={() => {
          props.onFocus(false)
          if (revert.current) {
            revert.current = false
            setDraft(props.note)
            return
          }
          if (draft !== props.note) props.onCommit(draft)
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
    </label>
  )
}

function TagField(props: {
  tags: string[]
  editing: boolean
  onFocus: (focused: boolean) => void
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="field">
      <span>Теги</span>
      <div className="tags">
        {props.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            {props.editing && (
              <button type="button" aria-label={`Снять ${tag}`} onClick={() => props.onRemove(tag)}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {props.editing && (
        <input
          aria-label="Тег"
          value={draft}
          placeholder="Тег"
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => props.onFocus(true)}
          onBlur={() => props.onFocus(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              props.onAdd(draft)
              setDraft('')
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setDraft('')
              event.currentTarget.blur()
            }
          }}
        />
      )}
    </div>
  )
}

function MeterField(props: {
  label: string
  value: number
  onFocus: (focused: boolean) => void
  onCommit: (units: number) => void
}) {
  const [draft, setDraft] = useState(formatMeters(props.value))
  const revert = useRef(false)
  useEffect(() => setDraft(formatMeters(props.value)), [props.value])
  return (
    <label className="field">
      <span>{props.label}, м</span>
      <input
        aria-label={props.label}
        value={draft}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => props.onFocus(true)}
        onBlur={() => {
          props.onFocus(false)
          if (revert.current) {
            revert.current = false
            setDraft(formatMeters(props.value))
            return
          }
          const parsed = parseMeters(draft)
          if (parsed === null) {
            setDraft(formatMeters(props.value))
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
          }
        }}
      />
    </label>
  )
}
