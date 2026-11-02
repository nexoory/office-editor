export const theme = {
  /** Снаружи здания: серее пола, чтобы помещения читались как пространство. */
  canvas: '#e9e7e1',
  floor: '#f8f7f3',
  grid: '#dedbd3',
  wall: '#3f3d39',
  selected: '#2f74b5',
  /** Обводка того, что схватит нажатие. */
  hover: '#2f74b5',
  vertex: '#5c5852',
  ghost: 'rgba(63, 61, 57, 0.33)',
  ghostDash: 'rgba(63, 61, 57, 0.22)',
  ghostVertex: 'rgba(63, 61, 57, 0.5)',
  window: '#fbfaf6',
  windowLine: '#3f3d39',
  /** Вырез проёма: темнее пола, светлее стены. В документ не пишется. */
  opening: '#d6d2ca',
  stairLine: '#77736b',
  label: '#2c2a26',
  labelHalo: '#f8f7f3',
  guide: '#c4a15a',
  /** Ось, на которой совпали точки или кромки. */
  smart: '#c4533a',
  snap: '#2f74b5',
  close: '#2f8f62',
  align: '#3d8f8a',
  text: '#26241f',
  muted: '#7a756c',
  /** Точка маркера, не подходящего под фильтр. */
  markerMuted: '#b3aea5',
  markerRing: '#ffffff',
  category: {
    navigation: '#4a515c',
    sanitary: '#2f7fc1',
    kitchen: '#e07b2a',
    tech: '#7a5cc4',
    furniture: '#a08a6c',
    other: '#d1495b',
  },
  access: {
    badge: '#2f9e6a',
    key: '#d49a1c',
  },
  /** Образцы пола помещений: пастель, разбавляется полом. */
  roomSwatches: [
    '#d7a394',
    '#b7c4a4',
    '#e3c98a',
    '#91a8bc',
    '#c7b3cc',
    '#c9b2a2',
    '#a9c0b6',
    '#e2b7a6',
  ],
  /** Образцы предметов: насыщенные, красят маркер и контур. */
  markerSwatches: [
    '#d1495b',
    '#e07b2a',
    '#d49a1c',
    '#2f9e6a',
    '#2a9d9a',
    '#2f7fc1',
    '#7a5cc4',
    '#c2569b',
  ],
}

function mixHex(color: string, toward: string, amount: number): string {
  const channel = (hex: string) => {
    const value = Number.parseInt(hex.replace('#', ''), 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const from = channel(color)
  const to = channel(toward)
  const mixed = from.map((part, index) => Math.round(part * amount + to[index] * (1 - amount)))
  return `#${mixed.map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

/** Образец, разбавленный полом: помещение остаётся фоном. */
export function roomFill(color: string | null): string {
  if (!color) return theme.floor
  return mixHex(color, theme.floor, 0.3)
}

/** Подпись комнаты: тот же оттенок, но тёмный, чтобы читался на своём поле. */
export function roomInk(color: string | null): string {
  if (!color) return theme.label
  const hex = color.replace('#', '')
  if (hex.length !== 6 || Number.isNaN(Number.parseInt(hex, 16))) return theme.label
  return mixHex(color, '#1e1c19', 0.42)
}

/** Надпись помещения на полу: тёмный оттенок заливки, без цвета — тёплый серый. */
export function roomMark(color: string | null): string {
  if (!color) return '#6f6a61'
  const hex = color.replace('#', '')
  if (hex.length !== 6 || Number.isNaN(Number.parseInt(hex, 16))) return '#6f6a61'
  return mixHex(color, '#1e1c19', 0.55)
}

export const ROOM_MARK_OPACITY = 0.5

/** Знак комнаты в интерфейсе: образец чуть темнее, чтобы не терялся на белом. */
export function roomTone(color: string | null): string {
  if (!color) return theme.muted
  return mixHex(color, '#1e1c19', 0.8)
}
