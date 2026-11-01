import { useEffect, useRef, useState } from 'react'
import { formatMeters, parseMeters } from '../geometry/formatLength'
import {
  CHAIR_FIELDS,
  CHAIR_NAME,
  OBJECT_FIELDS,
  OBJECT_ORDER,
  chairsOf,
  objectName,
  visibleFields,
} from '../objects/catalog'
import { TypeMark } from '../objects/signs'
import { IconPicker } from './IconPicker'
import { theme } from '../theme'
import type { Floor, ObjectKind, PlanObject, Selection, StairDirection } from '../types'

export function ObjectColumn(props: {
  floor: Floor
  editing: boolean
  armed: ObjectKind | null
  selection: Selection | null
  onArm: (kind: ObjectKind) => void
  onTextFocus: (focused: boolean) => void
  onNote: (id: string, note: string) => void
  onAddTag: (id: string, tag: string) => void
  onRemoveTag: (id: string, tag: string) => void
  onColor: (id: string, color: string | null) => void
  onSymbol: (id: string, symbol: string) => void
  onLength: (id: string, length: number) => void
  onWidth: (id: string, width: number) => void
  onStep: (id: string, step: number) => void
  onDirection: (id: string, direction: StairDirection) => void
  onAddChair: (id: string) => void
  onSelectChair: (objectId: string, chairId: string) => void
  onChairLength: (objectId: string, chairId: string, length: number) => void
  onChairWidth: (objectId: string, chairId: string, width: number) => void
  onDelete: () => void
}) {
  const selection = props.selection
  const selectedObject =
    selection?.kind === 'object'
      ? props.floor.objects.find((item) => item.id === selection.id)
      : selection?.kind === 'chair'
        ? props.floor.objects.find((item) => item.id === selection.objectId)
        : undefined
  const selectedChair =
    selection?.kind === 'chair' && selectedObject
      ? chairsOf(selectedObject).find((item) => item.id === selection.chairId)
      : undefined
  const showFields = props.selection?.kind === 'object' || props.selection?.kind === 'chair'
  const fields = selectedChair
    ? visibleFields(CHAIR_FIELDS, props.editing)
    : selectedObject
      ? visibleFields(OBJECT_FIELDS, props.editing, selectedObject.kind)
      : []

  return (
    <aside className="object-column">
      {props.editing && (
        <div className="type-list">
          {OBJECT_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              className={props.armed === kind ? 'type-button armed' : 'type-button'}
              aria-pressed={props.armed === kind}
              onClick={() => props.onArm(kind)}
            >
              <TypeMark kind={kind} box={30} menu />
              <span>{objectName(kind)}</span>
            </button>
          ))}
        </div>
      )}
      {showFields && selectedObject && (
        <div className="object-fields">
          {fields.map((field) => {
            if (!selectedObject) return null
            if (field.id === 'typeName') {
              return (
                <p key={field.id} className="object-title">
                  {selectedChair ? CHAIR_NAME : objectName(selectedObject.kind)}
                </p>
              )
            }
            if (field.id === 'note') {
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
            if (field.id === 'tags') {
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
                    name={selectedObject.symbol ?? 'circle'}
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
            if (field.id === 'length' && props.editing) {
              return (
                <MeterField
                  key={selectedChair ? `chair-length-${selectedChair.id}` : `length-${selectedObject.id}`}
                  label="Длина"
                  value={selectedChair ? selectedChair.length : selectedObject.length}
                  onFocus={props.onTextFocus}
                  onCommit={(value) =>
                    selectedChair
                      ? props.onChairLength(selectedObject.id, selectedChair.id, value)
                      : props.onLength(selectedObject.id, value)
                  }
                />
              )
            }
            if (field.id === 'width' && props.editing) {
              return (
                <MeterField
                  key={selectedChair ? `chair-width-${selectedChair.id}` : `width-${selectedObject.id}`}
                  label="Ширина"
                  value={selectedChair ? selectedChair.width : selectedObject.width}
                  onFocus={props.onTextFocus}
                  onCommit={(value) =>
                    selectedChair
                      ? props.onChairWidth(selectedObject.id, selectedChair.id, value)
                      : props.onWidth(selectedObject.id, value)
                  }
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
            if (field.id === 'remove' && props.editing) {
              return (
                <button key={field.id} type="button" className="text-button" onClick={props.onDelete}>
                  Удалить
                </button>
              )
            }
            return null
          })}
        </div>
      )}
    </aside>
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
