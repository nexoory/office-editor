import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { ReactNode } from 'react'
import { Glyph } from '../Glyph'

export function Chip(props: {
  children: ReactNode
  pressed?: boolean
  expanded?: boolean
  title?: string
  onClick?: () => void
  onRemove?: () => void
  removeLabel?: string
}) {
  if (!props.onClick) {
    return (
      <span className="chip chip-static">
        {props.children}
        {props.onRemove && (
          <button type="button" className="chip-remove" aria-label={props.removeLabel} onClick={props.onRemove}>
            <Glyph icon={faXmark} size={9} />
          </button>
        )}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="chip"
      title={props.title}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
