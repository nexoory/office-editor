import { useEffect, useMemo, useRef, useState } from 'react'
import { FaIcon } from '../objects/faIcon'
import { QUICK_ICONS } from '../objects/icons'
import { findIcon, searchIcons, type IconChoice } from '../objects/iconList'

function IconThumb(props: { name: string | null; size?: number }) {
  const icon = findIcon(props.name ?? undefined)
  const size = props.size ?? 22
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <FaIcon icon={icon} size={size * 0.86} color="currentColor" />
    </svg>
  )
}

function quickChoices(): IconChoice[] {
  return QUICK_ICONS.flatMap((name) => {
    const icon = findIcon(name)
    return icon ? [{ name, icon }] : []
  })
}

export function IconPicker(props: {
  name: string | null
  onChange: (name: string | null) => void
  onFocus: (focused: boolean) => void
  resetLabel?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => (query.trim() ? searchIcons(query) : quickChoices()), [query])
  useEffect(() => {
    if (props.autoFocus) input.current?.focus()
  }, [props.autoFocus])
  const choose = (name: string | null) => {
    props.onChange(name)
    setQuery('')
  }
  return (
    <div className="icon-picker">
      <div className="icon-picker-row">
        <span className="icon-picker-current">
          <IconThumb name={props.name} />
        </span>
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
              choose(matches[0].name)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setQuery('')
            }
          }}
        />
      </div>
      {props.resetLabel && (
        <button
          type="button"
          className="text-button"
          onMouseDown={(event) => {
            event.preventDefault()
            choose(null)
          }}
        >
          {props.resetLabel}
        </button>
      )}
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
              choose(choice.name)
            }}
          >
            <IconThumb name={choice.name} size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}
