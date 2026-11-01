import { useEffect, useMemo, useRef, useState } from 'react'
import { FaIcon } from '../objects/faIcon'
import { findIcon, searchIcons } from '../objects/iconList'

function IconThumb(props: { name: string; size?: number }) {
  const icon = findIcon(props.name)
  const size = props.size ?? 22
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <FaIcon icon={icon} size={size * 0.86} color="currentColor" />
    </svg>
  )
}

export function IconPicker(props: {
  name: string
  onChange: (name: string) => void
  onFocus: (focused: boolean) => void
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => searchIcons(query), [query])
  useEffect(() => {
    if (props.autoFocus) input.current?.focus()
  }, [props.autoFocus])
  const choose = (name: string) => {
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
