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
      <div className="shortcuts" role="dialog" aria-label="Клавиши" onPointerDown={(event) => event.stopPropagation()}>
        <div className="inspector-head">
          <p className="object-title">Клавиши и жесты</p>
          <button type="button" className="icon-button" aria-label="Закрыть" onClick={props.onClose}>
            ×
          </button>
        </div>
        <Section title="Просмотр" rows={VIEW} />
        {props.editing && <Section title="Редактирование" rows={EDIT} />}
      </div>
    </div>
  )
}

function Section(props: { title: string; rows: Row[] }) {
  return (
    <section>
      <h3>{props.title}</h3>
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
