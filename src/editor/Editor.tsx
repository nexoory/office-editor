import { useCallback, useEffect, useRef, useState } from 'react'
import { KEY_PAN_PX } from '../constants'
import { Canvas } from './Canvas'
import { ContextMenu, type ContextMenuActions } from './ContextMenu'
import { faKeyboard } from '@fortawesome/free-solid-svg-icons'
import { FloorLabel, FloorLift } from './FloorSwitcher'
import { HintBar } from './HintBar'
import { Inspector, type InspectorActions } from './Inspector'
import { Legend } from './Legend'
import { PlacePalette } from './PlacePalette'
import { ShortcutsHelp } from './ShortcutsHelp'
import { Toolbar } from './Toolbar'
import { ViewControls } from './ViewControls'
import { IconButton } from './ui/Button'
import { COMPACT_QUERY, useMedia } from './ui/media'
import { Segmented } from './ui/Segmented'
import {
  activeFloor,
  addFloor,
  beginPlace,
  cancelPlace,
  cancelPointer,
  changeAddChair,
  changeDoorAccess,
  changeDoorHinge,
  changeDoorSide,
  changeObjectColor,
  changeObjectDirection,
  changeObjectLength,
  changeObjectName,
  changeObjectNote,
  changeObjectStep,
  changeObjectSymbol,
  changeObjectTag,
  changeObjectUntag,
  changeObjectWidth,
  changeOpeningKind,
  changeOpeningWidth,
  changeMarkSize,
  changeRoomIcon,
  changeWallPartition,
  changeWallSide,
  changeWallSplit,
  changeWallThickness,
  closeMenu,
  createEditorState,
  createOpening,
  deleteSelection,
  duplicateSelection,
  endDecor,
  endPlace,
  escape,
  finishChain,
  fitFloor,
  fitSelection,
  ghostFloor,
  menuAddOpening,
  menuAlignWall,
  menuPlaceObject,
  menuRaiseGhost,
  menuSplitWall,
  importMap,
  menuStartWall,
  movePlace,
  nudgeSelection,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  panBy,
  pinchView,
  pointerLeave,
  raiseAll,
  redo,
  removeFloor,
  renameHandled,
  requestRename,
  resetMarks,
  rotateSelection,
  selectChair,
  setBrowsing,
  setLegendFilter,
  setModifiers,
  setRoomColor,
  setRoomName,
  setSpace,
  setTool,
  showRoom,
  startDecor,
  switchFloor,
  toggleHelp,
  togglePalette,
  undo,
  wheelOpeningWidth,
  wheelWallSide,
  wheelWallThickness,
  zoomStep,
  type EditorState,
  type PointerInfo,
} from './reduce'
import { loadMap, parseImportedMap, saveMap, serializeMap, type MapSnapshot } from '../storage'
import type { Selection } from '../types'

type Update = (state: EditorState) => EditorState

function isMoving(state: EditorState): boolean {
  const type = state.gesture?.type
  return !!type && type !== 'pending' && type !== 'pan'
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadMap(snapshot: MapSnapshot) {
  downloadBlob(new Blob([serializeMap(snapshot)], { type: 'application/json' }), 'map.json')
}

/** Текущий вид этажа без сетки, ручек и подсветки выбора. */
function downloadPlanSvg(root: HTMLElement) {
  const source = root.querySelector('svg.plan-canvas')
  if (!(source instanceof SVGSVGElement)) return
  const rect = source.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const copy = source.cloneNode(true) as SVGSVGElement
  copy.querySelectorAll('[data-export="omit"]').forEach((node) => node.remove())
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(width))
  copy.setAttribute('height', String(height))
  copy.setAttribute('viewBox', `0 0 ${width} ${height}`)
  copy.removeAttribute('class')
  copy.removeAttribute('style')
  downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${copy.outerHTML}`], { type: 'image/svg+xml' }), 'map.svg')
}

export function Editor({ editing }: { editing: boolean }) {
  const [state, setState] = useState<EditorState>(() => createEditorState(loadMap()))
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const editingRef = useRef(editing)
  const stateRef = useRef(state)
  const canEdit = editing && !state.browsing
  const compact = useMedia(COMPACT_QUERY)
  editingRef.current = canEdit
  stateRef.current = state

  const stageSize = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect()
    return { width: rect?.width ?? 1, height: rect?.height ?? 1 }
  }, [])

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
    const apply = (update: Update) => setState(update)
    const typingIn = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    const onModifier = (event: KeyboardEvent) => {
      if (event.key === 'Alt') event.preventDefault()
      apply((current) => setModifiers(current, event.shiftKey, event.altKey, editingRef.current))
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Alt') {
        onModifier(event)
        return
      }
      if (typingIn(event.target)) return
      const edit = editingRef.current
      const code = event.code
      const mod = event.ctrlKey || event.metaKey
      const { width, height } = stageSize()
      const handled = (update: Update) => {
        event.preventDefault()
        apply(update)
      }
      if (mod) {
        if (code === 'KeyZ') handled((current) => (event.shiftKey ? redo(current, editingRef.current) : undo(current, editingRef.current)))
        else if (code === 'KeyY') handled((current) => redo(current, editingRef.current))
        else if (code === 'KeyD') handled((current) => duplicateSelection(current, editingRef.current))
        return
      }
      if (event.altKey) return
      if (code === 'Space') {
        event.preventDefault()
        if (!event.repeat) apply((current) => setSpace(current, true))
        return
      }
      if (event.key === 'Escape') return handled(escape)
      if (event.key === 'Delete' || event.key === 'Backspace') return handled((current) => deleteSelection(current, editingRef.current))
      if (event.key === 'PageUp') return handled((current) => switchFloor(current, 1))
      if (event.key === 'PageDown') return handled((current) => switchFloor(current, -1))
      if (event.key === '?' || (event.shiftKey && code === 'Slash')) return handled((current) => toggleHelp(current))
      if (event.shiftKey && code === 'Digit1') return handled((current) => fitFloor(current, width, height))
      if (event.shiftKey && code === 'Digit2') return handled((current) => fitSelection(current, width, height))
      if (code === 'Equal' || code === 'NumpadAdd') return handled((current) => zoomStep(current, 1, width, height))
      if (code === 'Minus' || code === 'NumpadSubtract') return handled((current) => zoomStep(current, -1, width, height))
      if (event.key.startsWith('Arrow')) {
        const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
        const current = stateRef.current
        if (edit && current.selection && current.selection.kind !== 'chair') {
          const step = event.shiftKey ? 10 : 1
          return handled((value) => nudgeSelection(value, editingRef.current, dx * step, dy * step))
        }
        return handled((value) => panBy(value, -dx * KEY_PAN_PX, -dy * KEY_PAN_PX))
      }
      if (event.key === 'Enter') {
        const current = stateRef.current
        if (current.chain || current.gesture?.type === 'draw') return handled(finishChain)
        if (current.decor) return handled(endDecor)
        if (current.selection?.kind === 'room') return handled((value) => requestRename(value, editingRef.current))
        return
      }
      if (!edit) return
      if (code === 'KeyV') return handled((current) => setTool(current, 'select', editingRef.current))
      if (code === 'KeyW') return handled((current) => setTool(current, 'wall', editingRef.current))
      if (code === 'KeyR') return handled((current) => rotateSelection(current, editingRef.current, event.shiftKey ? -1 : 1))
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Alt') onModifier(event)
      if (event.code === 'Space') {
        if (!typingIn(event.target)) event.preventDefault()
        apply((current) => setSpace(current, false))
      }
    }
    const onBlur = () => apply((current) => setModifiers(setSpace(current, false), false, false, editingRef.current))
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [stageSize])

  const update = useCallback((change: (current: EditorState, edit: boolean) => EditorState) => {
    setState((current) => change(current, editingRef.current))
  }, [])

  const pointerDown = useCallback((info: PointerInfo) => update((current, edit) => onPointerDown(current, info, edit)), [update])
  const pointerMove = useCallback((info: PointerInfo) => update((current, edit) => onPointerMove(current, info, edit)), [update])
  const pointerUp = useCallback((info: PointerInfo) => update((current, edit) => onPointerUp(current, info, edit)), [update])
  const wheel = useCallback((info: { sx: number; sy: number; deltaY: number }) => update((current) => onWheel(current, info)), [update])

  const floor = activeFloor(state)
  const focus = (focused: boolean) => setState((current) => ({ ...current, textFocused: focused }))
  const onSelected = <K extends Selection['kind']>(
    kind: K,
    change: (current: EditorState, edit: boolean, selection: Extract<Selection, { kind: K }>) => EditorState,
  ) =>
    update((current, edit) =>
      current.selection?.kind === kind ? change(current, edit, current.selection as Extract<Selection, { kind: K }>) : current,
    )

  /** Плавный сдвиг холста по вертикали: выбор выходит из-под шторки. */
  const reveal = (dy: number) => {
    const start = performance.now()
    let done = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 220)
      const target = dy * (1 - (1 - k) ** 3)
      const delta = target - done
      done = target
      setState((current) => panBy(current, 0, delta))
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  const inspectorActions: InspectorActions = {
    onTextFocus: focus,
    onDelete: () => update(deleteSelection),
    onCopy: () => update(duplicateSelection),
    onRotate: () => update((current, edit) => rotateSelection(current, edit, 1)),
    onClose: () => setState((current) => ({ ...current, selection: null })),
    onReveal: (dy) => reveal(dy),
    onThickness: (value) => onSelected('wall', (current, edit, selection) => changeWallThickness(current, edit, selection.id, value)),
    onThicknessWheel: (deltaY) =>
      onSelected('wall', (current, edit, selection) => wheelWallThickness(current, edit, selection.id, deltaY)),
    onSplitSides: (split) => onSelected('wall', (current, edit, selection) => changeWallSplit(current, edit, selection.id, split)),
    onInner: (value) => onSelected('wall', (current, edit, selection) => changeWallSide(current, edit, selection.id, 'inner', value)),
    onOuter: (value) => onSelected('wall', (current, edit, selection) => changeWallSide(current, edit, selection.id, 'outer', value)),
    onInnerWheel: (deltaY) =>
      onSelected('wall', (current, edit, selection) => wheelWallSide(current, edit, selection.id, 'inner', deltaY)),
    onOuterWheel: (deltaY) =>
      onSelected('wall', (current, edit, selection) => wheelWallSide(current, edit, selection.id, 'outer', deltaY)),
    onPartition: (partition) =>
      onSelected('wall', (current, edit, selection) => changeWallPartition(current, edit, selection.id, partition)),
    onOpening: (kind) => update((current, edit) => createOpening(current, edit, kind)),
    onOpeningWidth: (value) =>
      onSelected('opening', (current, edit, selection) => changeOpeningWidth(current, edit, selection.id, value)),
    onOpeningWheel: (deltaY, deltaMode) =>
      onSelected('opening', (current, edit, selection) => wheelOpeningWidth(current, edit, selection.id, deltaY, deltaMode)),
    onOpeningKind: (kind) => onSelected('opening', (current, edit, selection) => changeOpeningKind(current, edit, selection.id, kind)),
    onHinge: (hinge) => onSelected('opening', (current, edit, selection) => changeDoorHinge(current, edit, selection.id, hinge)),
    onSide: (side) => onSelected('opening', (current, edit, selection) => changeDoorSide(current, edit, selection.id, side)),
    onAccess: (access) => onSelected('opening', (current, edit, selection) => changeDoorAccess(current, edit, selection.id, access)),
    onRename: (name) => onSelected('room', (current, edit, selection) => setRoomName(current, edit, selection.id, name)),
    onRoomColor: (color) => onSelected('room', (current, edit, selection) => setRoomColor(current, edit, selection.id, color)),
    onRoomIcon: (icon) => onSelected('room', (current, edit, selection) => changeRoomIcon(current, edit, selection.id, icon)),
    onDecor: () => update(startDecor),
    onDecorDone: () => setState(endDecor),
    onMarkSize: (part, size) => update((current, edit) => changeMarkSize(current, edit, part, size)),
    onMarkReset: () => update(resetMarks),
    onNote: (id, note) => update((current, edit) => changeObjectNote(current, edit, id, note)),
    onName: (id, name) => update((current, edit) => changeObjectName(current, edit, id, name)),
    onAddTag: (id, tag) => update((current, edit) => changeObjectTag(current, edit, id, tag)),
    onRemoveTag: (id, tag) => update((current, edit) => changeObjectUntag(current, edit, id, tag)),
    onColor: (id, color) => update((current, edit) => changeObjectColor(current, edit, id, color)),
    onSymbol: (id, symbol) => update((current, edit) => changeObjectSymbol(current, edit, id, symbol)),
    onLength: (id, length) => update((current, edit) => changeObjectLength(current, edit, id, length)),
    onWidth: (id, width) => update((current, edit) => changeObjectWidth(current, edit, id, width)),
    onStep: (id, step) => update((current, edit) => changeObjectStep(current, edit, id, step)),
    onDirection: (id, direction) => update((current, edit) => changeObjectDirection(current, edit, id, direction)),
    onAddChair: (id) => update((current, edit) => changeAddChair(current, edit, id)),
    onSelectChair: (objectId, chairId) => update((current) => selectChair(current, objectId, chairId)),
    onRenameHandled: () => setState(renameHandled),
  }

  const menuActions: ContextMenuActions = {
    onAddObject: (kind) => update((current, edit) => menuPlaceObject(current, edit, kind)),
    onStartWall: () => update(menuStartWall),
    onRaiseAll: () => update(raiseAll),
    onRaiseGhost: () => update(menuRaiseGhost),
    onRename: () => update(requestRename),
    onDecor: () => update((current, edit) => closeMenu(startDecor(current, edit))),
    onDelete: () => update((current, edit) => closeMenu(deleteSelection(current, edit))),
    onAddOpening: (kind) => update((current, edit) => menuAddOpening(current, edit, kind)),
    onSplit: () => update(menuSplitWall),
    onAlign: () => update(menuAlignWall),
    onPartition: (partition) =>
      onSelected('wall', (current, edit, selection) => closeMenu(changeWallPartition(current, edit, selection.id, partition))),
    onOpeningKind: (kind) =>
      onSelected('opening', (current, edit, selection) => closeMenu(changeOpeningKind(current, edit, selection.id, kind))),
    onCopy: () => update(duplicateSelection),
    onRotate: () => update((current, edit) => closeMenu(rotateSelection(current, edit, 1))),
    onExport: () => {
      const current = stateRef.current
      downloadMap({ document: current.document, activeFloorId: current.activeFloorId, view: current.view })
      setState(closeMenu)
    },
    onExportSvg: () => {
      if (stageRef.current) downloadPlanSvg(stageRef.current)
      setState(closeMenu)
    },
    onImport: () => {
      setState(closeMenu)
      fileRef.current?.click()
    },
    onClose: () => update(closeMenu),
  }

  const showInspector = !!state.selection && !state.menu && !isMoving(state) && !(canEdit && state.tool === 'wall')

  return (
    <div className="editor">
      <div className="stage" ref={stageRef}>
        <Canvas
          state={state}
          editing={canEdit}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => update(cancelPointer)}
          onPointerLeave={() => update(pointerLeave)}
          onDoubleClick={(info) => {
            const size = stageSize()
            update((current, edit) => onDoubleClick(current, info, edit, size.width, size.height))
          }}
          onPinch={(info) => update((current) => pinchView(current, info))}
          onWheel={wheel}
        />
        <div className="topbar">
          <FloorLabel floors={state.document.floors} floor={floor} />
          {!canEdit && (
            <Legend
              floor={floor}
              filter={state.legendFilter}
              compact={compact}
              onFilter={(kind) => setState((current) => setLegendFilter(current, kind))}
              onRoom={(roomId) => {
                const size = stageSize()
                setState((current) => showRoom(current, roomId, size.width, size.height))
              }}
            />
          )}
          <div className="topbar-end">
            {editing && (
              <div className="panel mode-switch">
                <Segmented
                  label="Режим"
                  value={state.browsing ? 'view' : 'edit'}
                  options={[
                    { value: 'view', label: 'Просмотр' },
                    { value: 'edit', label: 'Редактирование' },
                  ]}
                  onChange={(mode) => setState((current) => setBrowsing(current, mode === 'view'))}
                />
              </div>
            )}
            <div className="panel help-button">
              <IconButton icon={faKeyboard} label="Клавиши" title="Клавиши — ?" onClick={() => setState((current) => toggleHelp(current))} />
            </div>
          </div>
        </div>
        <FloorLift
          floors={state.document.floors}
          floor={floor}
          editing={canEdit}
          onSwitch={(delta) => setState((current) => switchFloor(current, delta))}
          onAdd={(delta) => update((current, edit) => addFloor(current, edit, delta))}
          onRemove={() => update((current, edit) => removeFloor(current, edit))}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (!file) return
            void file.text().then((text) => {
              let value: unknown
              try {
                value = JSON.parse(text)
              } catch {
                return
              }
              setState((current) => {
                const snapshot = parseImportedMap(value, current.view)
                if (!snapshot) return current
                return importMap(current, editingRef.current, snapshot)
              })
            })
          }}
        />
        {showInspector && state.selection && (
          <Inspector
            floor={floor}
            selection={state.selection}
            view={state.view}
            editing={canEdit}
            sheet={compact && !canEdit}
            renaming={state.renaming}
            decor={canEdit ? state.decor : null}
            actions={inspectorActions}
          />
        )}
        {state.menu && canEdit && (
          <ContextMenu menu={state.menu} floor={floor} hasGhost={!!ghostFloor(state)} actions={menuActions} />
        )}
        {canEdit && !state.decor && (
          <Toolbar tool={state.tool} onTool={(tool) => update((current, edit) => setTool(current, tool, edit))}>
            <PlacePalette
              open={state.paletteOpen}
              stageRef={stageRef}
              onToggle={() => setState((current) => togglePalette(current))}
              onBegin={(kind, sx, sy) => setState((current) => beginPlace(current, kind, sx, sy))}
              onMove={(sx, sy, alt) => setState((current) => movePlace(current, sx, sy, alt))}
              onEnd={(overCanvas, width, height) => update((current, edit) => endPlace(current, edit, overCanvas, width, height))}
              onCancel={() => setState((current) => cancelPlace(current))}
            />
          </Toolbar>
        )}
        {canEdit && <HintBar state={state} editing={canEdit} />}
        <ViewControls
          zoom={state.view.zoom}
          onZoom={(dir) => {
            const size = stageSize()
            setState((current) => zoomStep(current, dir, size.width, size.height))
          }}
          onFit={() => {
            const size = stageSize()
            setState((current) => fitFloor(current, size.width, size.height))
          }}
        />
        {state.help && <ShortcutsHelp editing={canEdit} onClose={() => setState((current) => toggleHelp(current, false))} />}
      </div>
    </div>
  )
}
