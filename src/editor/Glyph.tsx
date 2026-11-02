import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FaIcon } from '../objects/faIcon'

/** Знак Font Awesome для кнопки интерфейса, по центру своего квадрата. */
export function Glyph(props: { icon: IconDefinition; size?: number }) {
  const size = props.size ?? 16
  const box = size + 2
  return (
    <svg width={box} height={box} viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} aria-hidden="true">
      <FaIcon icon={props.icon} size={size} color="currentColor" />
    </svg>
  )
}
