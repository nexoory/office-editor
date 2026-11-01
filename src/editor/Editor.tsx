import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from './Canvas'
import { FloorSwitcher } from './FloorSwitcher'
import {
  activeFloor,
  addFloor,
  createEditorState,
  createOpening,
  deleteSelection,
  escape,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  redo,
  setRoomColor,
  setRoomName,
  switchFloor,
  undo,
  type EditorState,
  type PointerInfo,
} from './reduce'
import { SelectionHud } from './SelectionHud'

export function Editor({ editing }: { editing: boolean }) {
  const [state, setState] = useState<EditorState>(createEditorState)
  const editingRef = useRef(editing)
  editingRef.current = editing

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      if (typing) return
      const key = event.key
      const mod = event.ctrlKey || event.metaKey
      if (mod && key.toLowerCase() === 'z') {
        event.preventDefault()
        setState((current) => (event.shiftKey ? redo(current, editingRef.current) : undo(current, editingRef.current)))
        return
      }
      if (key === 'Escape') {
        event.preventDefault()
        setState((current) => escape(current))
      } else if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        setState((current) => deleteSelection(current, editingRef.current))
      } else if (key === 'PageUp') {
        event.preventDefault()
        setState((current) => switchFloor(current, 1))
      } else if (key === 'PageDown') {
        event.preventDefault()
        setState((current) => switchFloor(current, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pointerDown = useCallback((info: PointerInfo) => {
    setState((current) => onPointerDown(current, info, editingRef.current))
  }, [])
  const pointerMove = useCallback((info: PointerInfo) => {
    setState((current) => onPointerMove(current, info, editingRef.current))
  }, [])
  const pointerUp = useCallback((info: PointerInfo) => {
    setState((current) => onPointerUp(current, info, editingRef.current))
  }, [])
  const wheel = useCallback((info: { sx: number; sy: number; deltaY: number; ctrl: boolean }) => {
    setState((current) => onWheel(current, info, editingRef.current))
  }, [])

  const floor = activeFloor(state)
  return (
    <div className="editor">
      <Canvas
        state={state}
        editing={editing}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onWheel={wheel}
      />
      <FloorSwitcher
        floors={state.document.floors}
        floor={floor}
        editing={editing}
        onSwitch={(delta) => setState((current) => switchFloor(current, delta))}
        onAdd={(delta) => setState((current) => addFloor(current, editingRef.current, delta))}
      />
      {state.selection && (
        <SelectionHud
          floor={floor}
          selection={state.selection}
          view={state.view}
          editing={editing}
          onDelete={() => setState((current) => deleteSelection(current, editingRef.current))}
          onOpening={(kind) => setState((current) => createOpening(current, editingRef.current, kind))}
          onRename={(name) =>
            setState((current) =>
              current.selection?.kind === 'room'
                ? setRoomName(current, editingRef.current, current.selection.id, name)
                : current,
            )
          }
          onColor={(color) =>
            setState((current) =>
              current.selection?.kind === 'room'
                ? setRoomColor(current, editingRef.current, current.selection.id, color)
                : current,
            )
          }
          onTextFocus={(focused) => setState((current) => ({ ...current, textFocused: focused }))}
        />
      )}
    </div>
  )
}
