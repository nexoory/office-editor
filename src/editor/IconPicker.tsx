import { faChevronDown, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FaIcon } from '../objects/faIcon'
import { QUICK_ICONS } from '../objects/icons'
import { findIcon, searchIcons, type IconChoice } from '../objects/iconList'
import { Glyph } from './Glyph'

function IconThumb(props: { name: string | null; size?: number }) {
  const icon = findIcon(props.name ?? undefined)
  const size = props.size ?? 16
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <FaIcon icon={icon} size={size * 0.9} color="currentColor" />
    </svg>
  )
}

function quickChoices(): IconChoice[] {
  return QUICK_ICONS.flatMap((name) => {
    const icon = findIcon(name)
    return icon ? [{ name, icon }] : []
  })
}

function IconPicker(props: {
  name: string | null
  onChange: (name: string | null) => void
  onFocus: (focused: boolean) => void
  resetLabel?: string
}) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => (query.trim() ? searchIcons(query) : quickChoices()), [query])
  const onFocus = useRef(props.onFocus)
  onFocus.current = props.onFocus
  useEffect(() => {
    input.current?.focus()
    // Поиск закрывается выбором, пока в нём фокус: blur при удалении узла приходит не везде.
    return () => onFocus.current(false)
  }, [])
  return (
    <div className="icon-picker">
      <span className="input input-search">
        <Glyph icon={faMagnifyingGlass} size={11} />
        <input
          ref={input}
          aria-label="Поиск иконки"
          placeholder="Поиск иконки"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => props.onFocus(true)}
          onBlur={() => props.onFocus(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault()
              props.onChange(matches[0].name)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (query) setQuery('')
              else props.onChange(props.name)
            }
          }}
        />
      </span>
      <div className="icon-picker-list" role="listbox" aria-label="Иконки">
        {matches.length === 0 && <p className="icon-picker-empty">Ничего не найдено</p>}
        {matches.map((choice) => (
          <button
            key={choice.name}
            type="button"
            role="option"
            aria-selected={choice.name === props.name}
            aria-label={choice.name}
            title={choice.name}
            onMouseDown={(event) => {
              event.preventDefault()
              props.onChange(choice.name)
            }}
          >
            <IconThumb name={choice.name} />
          </button>
        ))}
      </div>
      {props.resetLabel && (
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onMouseDown={(event) => {
            event.preventDefault()
            props.onChange(null)
          }}
        >
          {props.resetLabel}
        </button>
      )}
    </div>
  )
}

/** Текущая иконка кнопкой; поиск раскрывается под ней и закрывается выбором. */
export function IconSelect(props: {
  name: string | null
  onChange: (name: string | null) => void
  onFocus: (focused: boolean) => void
  resetLabel?: string
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const shown = findIcon(props.name ?? undefined) ? props.name : null
  return (
    <div className="icon-select">
      <button type="button" className="btn btn-outline icon-select-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="icon-select-current">{shown ? <IconThumb name={shown} /> : null}</span>
        <span className="icon-select-name">{shown ?? props.emptyLabel ?? 'Нет'}</span>
        <Glyph icon={faChevronDown} size={10} />
      </button>
      {open && (
        <IconPicker
          name={props.name}
          resetLabel={props.resetLabel}
          onFocus={props.onFocus}
          onChange={(name) => {
            setOpen(false)
            if (name !== props.name) props.onChange(name)
          }}
        />
      )}
    </div>
  )
}
