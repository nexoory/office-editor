import { faExpand, faKeyboard, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { Glyph } from './Glyph'

export function ViewControls(props: {
  zoom: number
  onZoom: (dir: 1 | -1) => void
  onFit: () => void
  onHelp: () => void
}) {
  return (
    <div className="view-controls" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Приблизить" title="Приблизить — +" onClick={() => props.onZoom(1)}>
        <Glyph icon={faPlus} size={14} />
      </button>
      <span className="view-zoom" aria-label="Масштаб">
        {Math.round(props.zoom * 100)}%
      </span>
      <button type="button" aria-label="Отдалить" title="Отдалить — −" onClick={() => props.onZoom(-1)}>
        <Glyph icon={faMinus} size={14} />
      </button>
      <button type="button" aria-label="Вписать этаж" title="Вписать этаж — Shift+1" onClick={props.onFit}>
        <Glyph icon={faExpand} size={14} />
      </button>
      <button type="button" aria-label="Клавиши" title="Клавиши — ?" onClick={props.onHelp}>
        <Glyph icon={faKeyboard} size={15} />
      </button>
    </div>
  )
}
