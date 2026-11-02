import { faExpand, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { IconButton } from './ui/Button'

/** Масштаб одной пилюлей. На сенсорном экране остаётся только «Вписать»: масштаб меняется щипком. */
export function ViewControls(props: { zoom: number; onZoom: (dir: 1 | -1) => void; onFit: () => void }) {
  return (
    <div className="panel view-controls" onPointerDown={(event) => event.stopPropagation()}>
      <div className="zoom-steps">
        <IconButton icon={faMinus} size={12} label="Отдалить" title="Отдалить — −" onClick={() => props.onZoom(-1)} />
        <span className="view-zoom" aria-label="Масштаб">
          {Math.round(props.zoom * 100)}%
        </span>
        <IconButton icon={faPlus} size={12} label="Приблизить" title="Приблизить — +" onClick={() => props.onZoom(1)} />
        <span className="divider" />
      </div>
      <IconButton icon={faExpand} size={13} label="Вписать этаж" title="Вписать этаж — Shift+1" onClick={props.onFit} />
    </div>
  )
}
