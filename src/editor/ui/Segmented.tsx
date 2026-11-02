import type { ReactNode } from 'react'

export type SegmentOption<T extends string> = { value: T; label: ReactNode; aria?: string }

/** Выбор одного из нескольких: кнопки в общей рамке, выбранная поднята. */
export function Segmented<T extends string>(props: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={['seg', props.className].filter(Boolean).join(' ')} role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="seg-item"
          aria-label={option.aria}
          title={option.aria}
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
