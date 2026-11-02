import type { ReactNode } from 'react'
import { faArrowPointer, faDrawPolygon } from '@fortawesome/free-solid-svg-icons'
import { Glyph } from './Glyph'
import type { Tool } from './input'

export function Toolbar(props: { tool: Tool; onTool: (tool: Tool) => void; children?: ReactNode }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Инструменты" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="tool-button"
        aria-pressed={props.tool === 'select'}
        aria-label="Выбор"
        title="Выбор — V"
        onClick={() => props.onTool('select')}
      >
        <Glyph icon={faArrowPointer} />
        <kbd>V</kbd>
      </button>
      <button
        type="button"
        className="tool-button"
        aria-pressed={props.tool === 'wall'}
        aria-label="Стена"
        title="Стена — W"
        onClick={() => props.onTool('wall')}
      >
        <Glyph icon={faDrawPolygon} />
        <kbd>W</kbd>
      </button>
      <span className="toolbar-sep" />
      {props.children}
    </div>
  )
}
