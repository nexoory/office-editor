import { UNITS_PER_METER } from '../constants'

/** Длина стены в метрах подписи: единица холста делится на UNITS_PER_METER. Округление до сантиметра. */
export function formatLength(length: number): string {
  const rounded = Math.round((Math.max(0, length) / UNITS_PER_METER) * 100) / 100
  if (rounded >= 1) {
    let text = rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    text = text.replace('.', ',')
    return `${text} м`
  }
  return `${Math.round(rounded * 100)} см`
}

/** Число метров для поля: то же округление до сантиметра, без названия единицы. */
export function formatMeters(units: number): string {
  const meters = Math.round(Math.max(0, units)) / UNITS_PER_METER
  return meters.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')
}

/** Метры из поля в единицы холста, уже округлённые до сантиметра. */
export function parseMeters(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const meters = Number(cleaned)
  if (!Number.isFinite(meters)) return null
  return Math.round(meters * UNITS_PER_METER)
}

export function formatSize(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded).replace('.', ',')
}
