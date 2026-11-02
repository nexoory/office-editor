import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from './Canvas'
import { FloorSwitcher } from './FloorSwitcher'
import { Legend } from './Legend'
import { ObjectHud } from './ObjectHud'
import { PlacePalette } from './PlacePalette'
import {
  activeFloor,
  addFloor,
  beginPlace,
  centerOnRoom,
  changeAddChair,
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
  changeWallPartition,
  changeRoomIcon,
  copyObject,
  createEditorState,
  createOpening,
  deleteSelection,
  cancelPlace,
  endPlace,
  escape,
  movePlace,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  startObjectHandle,
  redo,
  selectChair,
  setBrowsing,
  setLegendFilter,
  setRoomColor,
  setRoomName,
  switchFloor,
  togglePalette,
  undo,
  type EditorState,
  type PointerInfo,
} from './reduce'
import { SelectionHud } from './SelectionHud'
import { loadMap, saveMap } from '../storage'

export function Editor({ editing }: { editing: boolean }) {
  const [state, setState] = useState<EditorState>(() => createEditorState(loadMap()))
  const stageRef = useRef<HTMLDivElement>(null)
  const editingRef = useRef(editing)
  const stateRef = useRef(state)
  const canEdit = editing && !state.browsing
  editingRef.current = canEdit
  stateRef.current = state

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = stateRef.current
      saveMap({ document: current.document, activeFloorId: current.activeFloorId, view: current.view })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [state.document, state.activeFloorId, state.view])

  useEffect(() => {
    const flush = () => {
      const current = stateRef.current
      saveMap({ document: current.document, activeFloorId: current.activeFloorId, view: current.view })
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

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
  const wheel = useCallback((info: { sx: number; sy: number; deltaY: number; deltaMode: number; ctrl: boolean }) => {
    setState((current) => onWheel(current, info, editingRef.current))
  }, [])

  const floor = activeFloor(state)
  const focus = (focused: boolean) => setState((current) => ({ ...current, textFocused: focused }))
  const stageSize = () => {
    const rect = stageRef.current?.getBoundingClientRect()
    return { width: rect?.width ?? 1, height: rect?.height ?? 1 }
  }
  return (
    <div className="editor">
      <div className="stage" ref={stageRef}>
        <Canvas
          state={state}
          editing={canEdit}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onWheel={wheel}
        />
        <FloorSwitcher
          floors={state.document.floors}
          floor={floor}
          editing={canEdit}
          shellEditing={editing}
          browsing={state.browsing}
          onBrowse={(browsing) => setState((current) => setBrowsing(current, browsing))}
          onSwitch={(delta) => setState((current) => switchFloor(current, delta))}
          onAdd={(delta) => setState((current) => addFloor(current, editingRef.current, delta))}
        />
        {state.selection && state.selection.kind !== 'object' && state.selection.kind !== 'chair' && (
          <SelectionHud
            floor={floor}
            selection={state.selection}
            view={state.view}
            editing={canEdit}
            onDelete={() => setState((current) => deleteSelection(current, editingRef.current))}
            onOpening={(kind) => setState((current) => createOpening(current, editingRef.current, kind))}
            onPartition={(partition) =>
              setState((current) =>
                current.selection?.kind === 'wall'
                  ? changeWallPartition(current, editingRef.current, current.selection.id, partition)
                  : current,
              )
            }
            onRename={(name) =>
              setState((current) =>
                current.selection?.kind === 'room' ? setRoomName(current, editingRef.current, current.selection.id, name) : current,
              )
            }
            onColor={(color) =>
              setState((current) =>
                current.selection?.kind === 'room' ? setRoomColor(current, editingRef.current, current.selection.id, color) : current,
              )
            }
            onTextFocus={focus}
            onIcon={(icon) =>
              setState((current) =>
                current.selection?.kind === 'room' ? changeRoomIcon(current, editingRef.current, current.selection.id, icon) : current,
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
        {state.selection && (state.selection.kind === 'object' || state.selection.kind === 'chair') && (
          <ObjectHud
            floor={floor}
            selection={state.selection}
            view={state.view}
            editing={canEdit}
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
            onCopy={(id) => setState((current) => copyObject(current, editingRef.current, id))}
            onDelete={() => setState((current) => deleteSelection(current, editingRef.current))}
            stageRef={stageRef}
            onHandleDown={(kind, info) => setState((current) => startObjectHandle(current, kind, info, editingRef.current))}
            onHandleMove={(info) => setState((current) => onPointerMove(current, info, editingRef.current))}
            onHandleUp={(info) => setState((current) => onPointerUp(current, info, editingRef.current))}
          />
        )}
        {canEdit && (
          <PlacePalette
            open={state.paletteOpen}
            stageRef={stageRef}
            onToggle={() => setState((current) => togglePalette(current))}
            onBegin={(kind, sx, sy) => setState((current) => beginPlace(current, kind, sx, sy))}
            onMove={(sx, sy) => setState((current) => movePlace(current, sx, sy))}
            onEnd={(overCanvas, width, height) =>
              setState((current) => endPlace(current, editingRef.current, overCanvas, width, height))
            }
            onCancel={() => setState((current) => cancelPlace(current))}
          />
        )}
        <Legend
          floor={floor}
          filter={state.legendFilter}
          top={editing ? 148 : 104}
          onFilter={(kind) => setState((current) => setLegendFilter(current, kind))}
          onRoom={(roomId) => {
            const size = stageSize()
            setState((current) => centerOnRoom(current, roomId, size.width, size.height))
          }}
        />
      </div>
    </div>
  )
}
