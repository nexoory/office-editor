import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from './Canvas'
import { FloorSwitcher } from './FloorSwitcher'
import { Legend } from './Legend'
import { ObjectColumn } from './ObjectColumn'
import {
  activeFloor,
  addFloor,
  armObject,
  changeAddChair,
  changeChairLength,
  changeChairWidth,
  changeDoorAccess,
  changeDoorHinge,
  changeDoorSide,
  changeObjectColor,
  changeObjectDirection,
  changeObjectLength,
  changeObjectNote,
  changeObjectStep,
  changeObjectSymbol,
  changeObjectTag,
  changeObjectUntag,
  changeObjectWidth,
  changeOpeningKind,
  changeRoomIcon,
  changeRoomSymbol,
  createEditorState,
  createOpening,
  deleteSelection,
  escape,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  redo,
  selectChair,
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
  const floating =
    state.selection && state.selection.kind !== 'object' && state.selection.kind !== 'chair' ? state.selection : null
  const focus = (focused: boolean) => setState((current) => ({ ...current, textFocused: focused }))
  return (
    <div className="editor">
      <div className="stage">
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
        {floating && (
          <SelectionHud
            floor={floor}
            selection={floating}
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
            onTextFocus={focus}
            onIcon={(icon) =>
              setState((current) =>
                current.selection?.kind === 'room'
                  ? changeRoomIcon(current, editingRef.current, current.selection.id, icon)
                  : current,
              )
            }
            onSymbol={(symbol) =>
              setState((current) =>
                current.selection?.kind === 'room'
                  ? changeRoomSymbol(current, editingRef.current, current.selection.id, symbol)
                  : current,
              )
            }
            onOpeningKind={(kind) =>
              setState((current) =>
                current.selection?.kind === 'opening'
                  ? changeOpeningKind(current, editingRef.current, current.selection.id, kind)
                  : current,
              )
            }
            onHinge={(hinge) =>
              setState((current) =>
                current.selection?.kind === 'opening'
                  ? changeDoorHinge(current, editingRef.current, current.selection.id, hinge)
                  : current,
              )
            }
            onSide={(side) =>
              setState((current) =>
                current.selection?.kind === 'opening'
                  ? changeDoorSide(current, editingRef.current, current.selection.id, side)
                  : current,
              )
            }
            onAccess={(access) =>
              setState((current) =>
                current.selection?.kind === 'opening'
                  ? changeDoorAccess(current, editingRef.current, current.selection.id, access)
                  : current,
              )
            }
          />
        )}
        <Legend floor={floor} />
      </div>
      <ObjectColumn
        floor={floor}
        editing={editing}
        armed={state.armed}
        selection={state.selection}
        onArm={(kind) => setState((current) => armObject(current, kind))}
        onTextFocus={focus}
        onNote={(id, note) => setState((current) => changeObjectNote(current, editingRef.current, id, note))}
        onAddTag={(id, tag) => setState((current) => changeObjectTag(current, editingRef.current, id, tag))}
        onRemoveTag={(id, tag) => setState((current) => changeObjectUntag(current, editingRef.current, id, tag))}
        onColor={(id, color) => setState((current) => changeObjectColor(current, editingRef.current, id, color))}
        onSymbol={(id, symbol) => setState((current) => changeObjectSymbol(current, editingRef.current, id, symbol))}
        onLength={(id, length) => setState((current) => changeObjectLength(current, editingRef.current, id, length))}
        onWidth={(id, width) => setState((current) => changeObjectWidth(current, editingRef.current, id, width))}
        onStep={(id, step) => setState((current) => changeObjectStep(current, editingRef.current, id, step))}
        onDirection={(id, direction) =>
          setState((current) => changeObjectDirection(current, editingRef.current, id, direction))
        }
        onAddChair={(id) => setState((current) => changeAddChair(current, editingRef.current, id))}
        onSelectChair={(objectId, chairId) => setState((current) => selectChair(current, objectId, chairId))}
        onChairLength={(objectId, chairId, length) =>
          setState((current) => changeChairLength(current, editingRef.current, objectId, chairId, length))
        }
        onChairWidth={(objectId, chairId, width) =>
          setState((current) => changeChairWidth(current, editingRef.current, objectId, chairId, width))
        }
        onDelete={() => setState((current) => deleteSelection(current, editingRef.current))}
      />
    </div>
  )
}
