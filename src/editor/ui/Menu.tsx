import { faCheck } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { ReactNode } from 'react'
import { Glyph } from '../Glyph'

export function MenuItem(props: {
  label: string
  keys?: string
  icon?: IconDefinition
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  expanded?: boolean
  trailing?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role={props.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={props.checked}
      aria-expanded={props.expanded}
      className={props.danger ? 'menu-item danger' : 'menu-item'}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="menu-icon">
        {props.checked ? <Glyph icon={faCheck} size={11} /> : props.icon ? <Glyph icon={props.icon} size={12} /> : null}
      </span>
      <span className="menu-label">{props.label}</span>
      {props.keys && <kbd>{props.keys}</kbd>}
      {props.trailing}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />
}
