import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { Glyph } from '../Glyph'

/** Строка карточки: подпись слева, элемент справа. */
export function Field(props: { label: string; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <div className={props.align === 'start' ? 'field field-start' : 'field'}>
      <span className="field-label">{props.label}</span>
      <div className="field-control">{props.children}</div>
    </div>
  )
}

/** Правка в черновике: Enter и уход из поля сохраняют, Esc возвращает прежнее. */
function useDraft(shown: string, commit: (text: string, reset: () => void) => void, onFocus?: (focused: boolean) => void) {
  const [draft, setDraft] = useState(shown)
  const revert = useRef(false)
  useEffect(() => setDraft(shown), [shown])
  return {
    draft,
    setDraft,
    input: {
      value: draft,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
      onFocus: () => onFocus?.(true),
      onBlur: () => {
        onFocus?.(false)
        if (revert.current) {
          revert.current = false
          setDraft(shown)
          return
        }
        commit(draft, () => setDraft(shown))
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          revert.current = true
          event.currentTarget.blur()
        }
      },
    },
  }
}

export function TextField(props: {
  value: string
  label: string
  placeholder?: string
  className?: string
  inputRef?: Ref<HTMLInputElement>
  onFocus?: (focused: boolean) => void
  onCommit: (value: string) => void
}) {
  const { input } = useDraft(
    props.value,
    (text) => {
      if (text !== props.value) props.onCommit(text)
    },
    props.onFocus,
  )
  return (
    <span className={['input', props.className].filter(Boolean).join(' ')}>
      <input ref={props.inputRef} aria-label={props.label} placeholder={props.placeholder} {...input} />
    </span>
  )
}

/** Число с единицей внутри поля. С шагом — кнопки −/+, стрелки и колесо над полем. */
export function NumberField(props: {
  value: number
  label: string
  unit: string
  format: (value: number) => string
  parse: (text: string) => number | null
  step?: number
  onFocus?: (focused: boolean) => void
  onCommit: (value: number) => void
  onWheel?: (deltaY: number, deltaMode: number) => void
}) {
  const shown = props.format(props.value)
  const { input } = useDraft(
    shown,
    (text, reset) => {
      const parsed = text.trim() === '' ? null : props.parse(text)
      reset()
      if (parsed !== null && parsed !== props.value) props.onCommit(parsed)
    },
    props.onFocus,
  )
  const step = props.step
  return (
    <span
      className={step ? 'input input-number wheel-field' : 'input input-number'}
      onWheel={props.onWheel ? (event) => props.onWheel?.(event.deltaY, event.deltaMode) : undefined}
    >
      {step && (
        <button type="button" className="input-step" aria-label="Меньше" tabIndex={-1} onClick={() => props.onCommit(props.value - step)}>
          <Glyph icon={faMinus} size={10} />
        </button>
      )}
      <input
        aria-label={props.label}
        inputMode="decimal"
        {...input}
        onKeyDown={(event) => {
          if (step && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault()
            props.onCommit(props.value + (event.key === 'ArrowUp' ? step : -step))
            return
          }
          input.onKeyDown(event)
        }}
      />
      <span className="input-unit">{props.unit}</span>
      {step && (
        <button type="button" className="input-step" aria-label="Больше" tabIndex={-1} onClick={() => props.onCommit(props.value + step)}>
          <Glyph icon={faPlus} size={10} />
        </button>
      )}
    </span>
  )
}

export function Switch(props: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}
