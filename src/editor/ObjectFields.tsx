import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { useState } from 'react'
import { formatMeters, parseMeters } from '../geometry/formatLength'
import { OBJECT_FIELDS, chairsOf, typeSymbol, visibleFields } from '../objects/catalog'
import { theme } from '../theme'
import type { PlanObject, StairDirection } from '../types'
import { IconSelect } from './IconPicker'
import { IconButton } from './ui/Button'
import { Chip } from './ui/Chip'
import { Field, NumberField, TextField } from './ui/Field'
import { Segmented } from './ui/Segmented'
import { Swatches } from './ui/Swatches'

export type ObjectFieldActions = {
  onTextFocus: (focused: boolean) => void
  onNote: (id: string, note: string) => void
  onName: (id: string, name: string) => void
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

/** Тело карточки предмета: поля по матрице видимости, группами. Название и действия — в заголовке. */
export function ObjectFields(props: { object: PlanObject; editing: boolean; actions: ObjectFieldActions }) {
  const { object, editing, actions } = props
  const shown = new Set(visibleFields(OBJECT_FIELDS, editing, object.kind).map((field) => field.id))

  if (!editing) {
    const note = shown.has('note') ? object.note.trim() : ''
    const tags = shown.has('tags') ? object.tags : []
    if (!note && tags.length === 0) return null
    return (
      <div className="card-read">
        {note && <p className="card-note">{note}</p>}
        {tags.length > 0 && (
          <div className="chips">
            {tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        )}
      </div>
    )
  }

  const meters = { unit: 'м', format: formatMeters, parse: parseMeters, onFocus: actions.onTextFocus }
  return (
    <>
      {(shown.has('symbol') || shown.has('color')) && (
        <section className="card-group">
          {shown.has('symbol') && (
            <Field label="Иконка">
              <IconSelect
                name={object.symbol ?? typeSymbol(object.kind)}
                resetLabel="Иконка типа"
                onFocus={actions.onTextFocus}
                onChange={(symbol) => actions.onSymbol(object.id, symbol)}
              />
            </Field>
          )}
          {shown.has('color') && (
            <Field label="Цвет">
              <Swatches
                label="Цвет предмета"
                value={object.color}
                colors={theme.markerSwatches}
                resetLabel="Цвет категории"
                onChange={(color) => actions.onColor(object.id, color)}
              />
            </Field>
          )}
        </section>
      )}
      {(shown.has('length') || shown.has('width') || shown.has('step') || shown.has('direction')) && (
        <section className="card-group">
          {shown.has('length') && shown.has('width') && (
            <Field label="Размер">
              <div className="pair">
                <NumberField
                  key={`length-${object.id}`}
                  label="Длина"
                  value={object.length}
                  {...meters}
                  onCommit={(value) => actions.onLength(object.id, value)}
                />
                <span className="pair-sep">×</span>
                <NumberField
                  key={`width-${object.id}`}
                  label="Ширина"
                  value={object.width}
                  {...meters}
                  onCommit={(value) => actions.onWidth(object.id, value)}
                />
              </div>
            </Field>
          )}
          {shown.has('step') && (
            <Field label="Шаг">
              <NumberField
                key={`step-${object.id}`}
                label="Шаг"
                value={object.step ?? object.length}
                {...meters}
                onCommit={(value) => actions.onStep(object.id, value)}
              />
            </Field>
          )}
          {shown.has('direction') && (
            <Segmented
              label="Вверх или вниз"
              value={object.direction ?? 'up'}
              options={[
                { value: 'up', label: 'Вверх' },
                { value: 'down', label: 'Вниз' },
              ]}
              onChange={(direction) => actions.onDirection(object.id, direction)}
            />
          )}
        </section>
      )}
      {shown.has('chairs') && object.kind === 'table' && (
        <section className="card-group">
          <ChairRow object={object} onAdd={() => actions.onAddChair(object.id)} onSelect={(id) => actions.onSelectChair(object.id, id)} />
        </section>
      )}
      {(shown.has('name') || shown.has('note') || shown.has('tags')) && (
        <section className="card-group">
          {shown.has('name') && (
            <Field label="Название">
              <TextField
                label="Название"
                value={object.name ?? ''}
                placeholder="Нет"
                onFocus={actions.onTextFocus}
                onCommit={(name) => actions.onName(object.id, name)}
              />
            </Field>
          )}
          {shown.has('note') && (
            <Field label="Описание">
              <TextField
                label="Описание"
                value={object.note}
                placeholder="Нет"
                onFocus={actions.onTextFocus}
                onCommit={(note) => actions.onNote(object.id, note)}
              />
            </Field>
          )}
          {shown.has('tags') && (
            <Field label="Теги" align="start">
              <TagInput
                tags={object.tags}
                onFocus={actions.onTextFocus}
                onAdd={(tag) => actions.onAddTag(object.id, tag)}
                onRemove={(tag) => actions.onRemoveTag(object.id, tag)}
              />
            </Field>
          )}
        </section>
      )}
    </>
  )
}

function ChairRow(props: { object: PlanObject; onAdd: () => void; onSelect: (chairId: string) => void }) {
  const chairs = chairsOf(props.object)
  return (
    <Field label="Кресла">
      <div className="chips">
        {chairs.map((chair, index) => (
          <Chip key={chair.id} title={`Кресло ${index + 1}`} onClick={() => props.onSelect(chair.id)}>
            {index + 1}
          </Chip>
        ))}
        <IconButton icon={faPlus} size={11} label="Добавить кресло" className="btn-small" onClick={props.onAdd} />
      </div>
    </Field>
  )
}

/** Теги и поле нового тега в одной рамке. Enter добавляет, Backspace в пустом поле снимает последний. */
function TagInput(props: {
  tags: string[]
  onFocus: (focused: boolean) => void
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <span className="input input-tags">
      {props.tags.map((tag) => (
        <Chip key={tag} removeLabel={`Снять ${tag}`} onRemove={() => props.onRemove(tag)}>
          {tag}
        </Chip>
      ))}
      <input
        aria-label="Новый тег"
        value={draft}
        placeholder={props.tags.length ? '' : 'Добавить'}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => props.onFocus(true)}
        onBlur={() => props.onFocus(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (draft.trim()) props.onAdd(draft)
            setDraft('')
          } else if (event.key === 'Backspace' && !draft && props.tags.length) {
            event.preventDefault()
            props.onRemove(props.tags[props.tags.length - 1])
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setDraft('')
            event.currentTarget.blur()
          }
        }}
      />
    </span>
  )
}
