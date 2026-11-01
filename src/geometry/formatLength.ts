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

export function formatSize(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded).replace('.', ',')
}
