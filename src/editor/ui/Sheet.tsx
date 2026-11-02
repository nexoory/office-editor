import type { ReactNode, Ref } from 'react'

/** Нижняя шторка узкого экрана: во всю ширину, над холстом. */
export function Sheet(props: { children: ReactNode; label: string; className?: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={props.ref}
      className={['panel', 'sheet', props.className].filter(Boolean).join(' ')}
      role="dialog"
      aria-label={props.label}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="sheet-grip" aria-hidden="true" />
      {props.children}
    </div>
  )
}
