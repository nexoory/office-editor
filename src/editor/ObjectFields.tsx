import { useEffect, useRef, useState } from 'react'
import { formatMeters, parseMeters } from '../geometry/formatLength'
import { CHAIR_NAME, OBJECT_FIELDS, chairsOf, typeSymbol, visibleFields } from '../objects/catalog'
import { theme } from '../theme'
import type { PlanObject, StairDirection } from '../types'
import { IconPicker } from './IconPicker'

export type ObjectFieldActions = {
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
}

/** Тело карточки предмета: поля по матрице видимости. Название, копирование и удаление живут в заголовке карточки. */
export function ObjectFields(props: { object: PlanObject; editing: boolean; actions: ObjectFieldActions }) {
  const { object, editing, actions } = props
  const fields = visibleFields(OBJECT_FIELDS, editing, object.kind)
  return (
    <>
      {fields.map((field) => {
        if (field.id === 'note') {
          return (
            <NoteField
              key={field.id}
              note={object.note}
              editing={editing}
              onFocus={actions.onTextFocus}
              onCommit={(note) => actions.onNote(object.id, note)}
            />
          )
        }
        if (field.id === 'tags') {
          return (
            <TagField
              key={field.id}
              tags={object.tags}
              editing={editing}
              onFocus={actions.onTextFocus}
              onAdd={(tag) => actions.onAddTag(object.id, tag)}
              onRemove={(tag) => actions.onRemoveTag(object.id, tag)}
            />
          )
        }
        if (field.id === 'symbol' && editing) {
          return (
            <div key={field.id} className="field">
              <span>Иконка</span>
              <IconPicker
                name={object.symbol ?? typeSymbol(object.kind)}
                resetLabel="Иконка типа"
                onFocus={actions.onTextFocus}
                onChange={(symbol) => actions.onSymbol(object.id, symbol)}
              />
            </div>
          )
        }
        if (field.id === 'color' && editing) {
          return (
            <div key={field.id} className="field">
              <span>Цвет</span>
              <div className="swatches">
                <button
                  type="button"
                  className={object.color === null ? 'swatch type-swatch active' : 'swatch type-swatch'}
                  aria-label="Цвет типа"
                  onClick={() => actions.onColor(object.id, null)}
                />
                {theme.swatches.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={object.color === color ? 'swatch active' : 'swatch'}
                    style={{ background: color }}
                    aria-label="Цвет объекта"
                    onClick={() => actions.onColor(object.id, color)}
                  />
                ))}
              </div>
            </div>
          )
        }
        if (field.id === 'length' && editing) {
          return (
            <MeterField
              key={`length-${object.id}`}
              label="Длина"
              value={object.length}
              onFocus={actions.onTextFocus}
              onCommit={(value) => actions.onLength(object.id, value)}
            />
          )
        }
        if (field.id === 'width' && editing) {
          return (
            <MeterField
              key={`width-${object.id}`}
              label="Ширина"
              value={object.width}
              onFocus={actions.onTextFocus}
              onCommit={(value) => actions.onWidth(object.id, value)}
            />
          )
        }
        if (field.id === 'step' && editing) {
          return (
            <MeterField
              key={`step-${object.id}`}
              label="Шаг"
              value={object.step ?? object.length}
              onFocus={actions.onTextFocus}
              onCommit={(value) => actions.onStep(object.id, value)}
            />
          )
        }
        if (field.id === 'direction' && editing) {
          const direction = object.direction ?? 'up'
          return (
            <div key={field.id} className="field">
              <span>Направление</span>
              <div className="seg">
                <button type="button" aria-pressed={direction === 'up'} onClick={() => actions.onDirection(object.id, 'up')}>
                  Вверх
                </button>
                <button type="button" aria-pressed={direction === 'down'} onClick={() => actions.onDirection(object.id, 'down')}>
                  Вниз
                </button>
              </div>
            </div>
          )
        }
        if (field.id === 'chairs' && editing && object.kind === 'table') {
          return (
            <ChairList
              key={field.id}
              object={object}
              onAdd={() => actions.onAddChair(object.id)}
              onSelect={(chairId) => actions.onSelectChair(object.id, chairId)}
            />
          )
        }
        return null
      })}
    </>
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
