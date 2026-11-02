import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { IconButton } from './ui/Button'

type Row = [keys: string, action: string]

const VIEW: Row[] = [
  ['Тяните', 'двигать холст'],
  ['Колесо, щипок', 'масштаб'],
  ['Клик', 'выбрать помещение или предмет'],
  ['Двойной клик', 'вписать помещение или приблизить'],
  ['+ / −', 'масштаб'],
  ['Shift+1', 'вписать этаж'],
  ['Shift+2', 'вписать выбор'],
  ['Стрелки', 'двигать холст'],
  ['PageUp / PageDown', 'этаж выше или ниже'],
  ['Esc', 'снять выбор'],
]

const EDIT: Row[] = [
  ['V', 'выбор'],
  ['W', 'стена'],
  ['Тяните элемент', 'переместить'],
  ['Тяните пол или пустое место', 'двигать холст'],
  ['Пробел + тяните, средняя или правая кнопка', 'двигать холст'],
  ['Правая кнопка', 'меню действий'],
  ['Shift', 'углы 45°, ось, пропорции'],
  ['Alt', 'без направляющих'],
  ['Двойной клик или Enter', 'закончить цепочку стен'],
  ['Enter', 'переименовать помещение'],
  ['Стрелки / Shift+стрелки', 'сдвиг на 1 / 10 см'],
  ['R / Shift+R', 'повернуть предмет на 90°'],
  ['Ctrl+D', 'копия предмета'],
  ['Del', 'удалить'],
  ['Ctrl+Z', 'отменить'],
  ['Ctrl+Shift+Z, Ctrl+Y', 'вернуть'],
  ['Esc', 'шаг назад'],
]

export function ShortcutsHelp(props: { editing: boolean; onClose: () => void }) {
  return (
    <div className="shortcuts-backdrop" onPointerDown={props.onClose}>
      <div className="panel shortcuts" role="dialog" aria-label="Клавиши" onPointerDown={(event) => event.stopPropagation()}>
        <header className="card-head">
          <div className="card-titles">
            <p className="card-title">Клавиши и жесты</p>
          </div>
          <IconButton icon={faXmark} label="Закрыть" onClick={props.onClose} />
        </header>
        <Section title="Просмотр" rows={VIEW} />
        {props.editing && <Section title="Редактирование" rows={EDIT} />}
      </div>
    </div>
  )
}

function Section(props: { title: string; rows: Row[] }) {
  return (
    <section>
      <h3 className="group-title">{props.title}</h3>
      <dl>
        {props.rows.map(([keys, action]) => (
          <div key={keys} className="shortcut-row">
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
