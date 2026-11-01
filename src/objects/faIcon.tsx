import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export function FaIcon(props: { icon: IconDefinition; size: number; color: string; halo?: string; haloWidth?: number }) {
  const [width, height, , , data] = props.icon.icon
  const paths = Array.isArray(data) ? data : [data]
  const scale = props.size / Math.max(width, height)
  const halo = props.haloWidth ? props.haloWidth / scale : 0
  return (
    <g transform={`translate(${(-width * scale) / 2} ${(-height * scale) / 2}) scale(${scale})`}>
      {props.halo &&
        halo > 0 &&
        paths.map((d, index) => (
          <path key={`halo-${index}`} d={d} fill={props.halo} stroke={props.halo} strokeWidth={halo} strokeLinejoin="round" fillRule="evenodd" />
        ))}
      {paths.map((d, index) => (
        <path key={index} d={d} fill={props.color} fillRule="evenodd" />
      ))}
    </g>
  )
}
