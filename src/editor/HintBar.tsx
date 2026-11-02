import type { EditorState } from './reduce'

type Hint = [keys: string, action: string]

const ALT: Hint = ['Alt', 'без направляющих']

/** Что сделают клик, протягивание и модификаторы прямо сейчас. */
export function hintsFor(state: EditorState, editing: boolean): Hint[] {
  if (!editing) return []
  const gesture = state.gesture
  if (state.placing?.dragging) return [ALT, ['Esc', 'отменить']]
  if (gesture?.type === 'pan') return []
  if (gesture?.type === 'draw') return [['Отпустите', 'поставить стену'], ['Shift', 'углы 45°'], ALT, ['Esc', 'отменить']]
  if (gesture?.type === 'rotate-object') return [['Shift', 'шаг 45°'], ['Esc', 'отменить']]
  if (gesture?.type === 'resize-object') return [['Shift', 'сохранить пропорции'], ['Esc', 'отменить']]
  if (gesture?.type === 'move-wall') return [['Shift', 'только по нормали'], ALT, ['Esc', 'отменить']]
  if (gesture?.type === 'move-vertex') return [['Shift', 'углы 45°'], ALT, ['Esc', 'отменить']]
  if (gesture?.type === 'move-room' || gesture?.type === 'move-object') {
    return [['Shift', 'по горизонтали или вертикали'], ALT, ['Esc', 'отменить']]
  }
  if (gesture?.type === 'move-opening' || gesture?.type === 'move-chair') return [['Esc', 'отменить']]
  if (state.chain) {
    return [
      ['Клик', 'следующая точка'],
      ['Двойной клик или Enter', 'закончить'],
      ['Shift', 'углы 45°'],
      ALT,
      ['Esc', 'закончить'],
    ]
  }
  if (state.tool === 'wall') {
    return [
      ['Клик', 'первая точка'],
      ['Протяните', 'одна стена'],
      ['Пробел', 'двигать холст'],
      ['Esc', 'к выбору'],
    ]
  }
  const selection = state.selection
  if (selection?.kind === 'object') {
    return [
      ['Тяните', 'переместить'],
      ['R', 'повернуть'],
      ['Ctrl+D', 'копия'],
      ['Стрелки', 'сдвиг'],
      ['Del', 'удалить'],
    ]
  }
  if (selection?.kind === 'room') {
    return [
      ['Тяните', 'переместить помещение'],
      ['Двойной клик', 'переименовать'],
      ['Правая кнопка', 'действия'],
      ['Del', 'удалить'],
    ]
  }
  if (selection) {
    return [['Тяните', 'переместить'], ['Стрелки', 'сдвиг'], ['Правая кнопка', 'действия'], ['Del', 'удалить']]
  }
  return [
    ['Клик', 'выбрать'],
    ['Тяните', 'двигать элемент или холст'],
    ['Правая кнопка', 'действия'],
    ['W', 'стена'],
    ['?', 'все клавиши'],
  ]
}

export function HintBar(props: { state: EditorState; editing: boolean }) {
  const hints = hintsFor(props.state, props.editing)
  if (hints.length === 0) return null
  return (
    <div className="hint-bar" aria-live="polite">
      {hints.map(([keys, action]) => (
        <span key={keys + action}>
          <kbd>{keys}</kbd> {action}
        </span>
      ))}
    </div>
  )
}
