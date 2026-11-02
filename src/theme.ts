export const theme = {
  canvas: '#f4f2ec',
  floor: '#e7e4dc',
  grid: '#e3e0d7',
  wall: '#4a4742',
  selected: '#3d7ea6',
  /** Обводка того, что схватит нажатие. */
  hover: '#3d7ea6',
  vertex: '#5c5852',
  ghost: 'rgba(74, 71, 66, 0.33)',
  ghostDash: 'rgba(74, 71, 66, 0.22)',
  ghostVertex: 'rgba(74, 71, 66, 0.5)',
  window: '#fbfaf6',
  windowLine: '#4a4742',
  /** Вырез проёма: темнее пола, светлее стены. В документ не пишется. */
  opening: '#d4cfc6',
  label: '#2c2a26',
  labelHalo: '#f4f2ec',
  guide: '#c4a15a',
  /** Ось, на которой совпали точки или кромки. */
  smart: '#c4533a',
  snap: '#3d7ea6',
  close: '#2f8f62',
  align: '#3d8f8a',
  hud: 'rgba(255, 252, 247, 0.96)',
  hudLine: '#e0dcd3',
  text: '#2c2a26',
  muted: '#7a756c',
  doorBadge: '#2f8f62',
  doorKey: '#c4962c',
  objectNeutral: {
    stair: '#8a8680',
    table: '#a89880',
    cooler: '#7f97a8',
    microwave: '#8d8680',
    printer: '#8e9298',
    wardrobe: '#9a8b78',
    toilet: '#7f9aa3',
    sink: '#6e96a4',
    shower: '#7aa0ae',
    fridge: '#8aa39b',
    bed: '#b0a090',
    sofa: '#a08b78',
    interest: '#8d8680',
  },
  swatches: [
    '#d7a394',
    '#b7c4a4',
    '#e3c98a',
    '#91a8bc',
    '#c7b3cc',
    '#c9b2a2',
    '#a9c0b6',
    '#e2b7a6',
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

/** Образец, разбавленный холстом, чтобы предметы читались на полу. */
export function roomFill(color: string | null): string {
  if (!color) return theme.floor
  return mixHex(color, theme.canvas, 0.34)
}

export function roomInk(color: string | null): string {
  const source = color ?? theme.floor
  const hex = source.replace('#', '')
  const value = Number.parseInt(hex, 16)
  if (hex.length !== 6 || Number.isNaN(value)) return theme.label
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * 0.4)
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}
