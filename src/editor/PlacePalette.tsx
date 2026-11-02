import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { OBJECT_ORDER, objectName } from '../objects/catalog'
import { FaIcon } from '../objects/faIcon'
import { TypeMark } from '../objects/signs'
import type { ObjectKind } from '../types'

export function PlacePalette(props: {
  open: boolean
  stageRef: RefObject<HTMLDivElement | null>
  onToggle: () => void
  onBegin: (kind: ObjectKind, sx: number, sy: number) => void
  onMove: (sx: number, sy: number) => void
  onEnd: (overCanvas: boolean, width: number, height: number) => void
  onCancel: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const activePointer = useRef<number | null>(null)

  const locate = (event: ReactPointerEvent) => {
    const stage = props.stageRef.current?.getBoundingClientRect()
    if (!stage) return { sx: 0, sy: 0, over: false, width: 1, height: 1 }
    const sx = event.clientX - stage.left
    const sy = event.clientY - stage.top
    const inside = event.clientX >= stage.left && event.clientX <= stage.right && event.clientY >= stage.top && event.clientY <= stage.bottom
    const blocked = [menuRef.current, addRef.current].some((node) => {
      if (!node) return false
      const rect = node.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    })
    return { sx, sy, over: inside && !blocked, width: stage.width, height: stage.height }
  }

  return (
    <>
      <button
        ref={addRef}
        type="button"
        className="place-add"
        aria-label="Добавить предмет"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true">
          <FaIcon icon={faPlus} size={16} color="currentColor" />
        </svg>
      </button>
      {props.open && (
        <div ref={menuRef} className="place-menu" role="listbox" aria-label="Типы предметов">
          <div className="type-list">
            {OBJECT_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                className="type-button"
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  activePointer.current = event.pointerId
                  const point = locate(event)
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId)
                  } catch {
                    // Захват нужен, чтобы жест доехал за кнопку. Без него отпускание всё равно ставит предмет.
                  }
                  props.onBegin(kind, point.sx, point.sy)
                }}
                onPointerMove={(event) => {
                  if (activePointer.current !== event.pointerId) return
                  const point = locate(event)
                  props.onMove(point.sx, point.sy)
                }}
                onPointerUp={(event) => {
                  if (activePointer.current !== event.pointerId) return
                  activePointer.current = null
                  const point = locate(event)
                  props.onEnd(point.over, point.width, point.height)
                }}
                onPointerCancel={() => {
                  activePointer.current = null
                  props.onCancel()
                }}
              >
                <TypeMark kind={kind} box={30} />
                <span>{objectName(kind)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
