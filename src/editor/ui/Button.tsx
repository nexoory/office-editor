import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { ReactNode, Ref } from 'react'
import { Glyph } from '../Glyph'

type Common = {
  onClick?: () => void
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
  title?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/** Квадратная кнопка со знаком. Подпись нужна всегда: она же подсказка и имя для чтения с экрана. */
export function IconButton(props: Common & { icon: IconDefinition; label: string; size?: number; children?: ReactNode }) {
  return (
    <button
      ref={props.ref}
      type="button"
      className={['btn', 'btn-icon', props.className].filter(Boolean).join(' ')}
      aria-label={props.label}
      title={props.title ?? props.label}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Glyph icon={props.icon} size={props.size ?? 14} />
      {props.children}
    </button>
  )
}

export function Button(props: Common & { children: ReactNode; icon?: IconDefinition; variant?: 'ghost' | 'outline' | 'danger' | 'primary' }) {
  const variant = props.variant ?? 'outline'
  return (
    <button
      ref={props.ref}
      type="button"
      className={['btn', `btn-${variant}`, props.className].filter(Boolean).join(' ')}
      title={props.title}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.icon && <Glyph icon={props.icon} size={12} />}
      {props.children}
    </button>
  )
}
