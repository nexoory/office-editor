export const UI_FONT = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"

let context: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

/** Ширина строки в пикселях экрана для шрифта CSS. Без холста — грубая оценка по длине. */
export function textWidth(text: string, font: string): number {
  const key = `${font}\0${text}`
  const known = cache.get(key)
  if (known !== undefined) return known
  context ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  const size = Number.parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '12')
  let width = text.length * size * 0.56
  if (context) {
    context.font = font
    width = context.measureText(text).width
  }
  if (cache.size > 2000) cache.clear()
  cache.set(key, width)
  return width
}
