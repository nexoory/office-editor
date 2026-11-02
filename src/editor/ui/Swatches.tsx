export function Swatches(props: {
  value: string | null
  colors: string[]
  resetLabel: string
  label: string
  onChange: (color: string | null) => void
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label={props.label}>
      <button
        type="button"
        role="radio"
        className="swatch swatch-reset"
        aria-checked={props.value === null}
        aria-label={props.resetLabel}
        title={props.resetLabel}
        onClick={() => props.onChange(null)}
      />
      {props.colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          className="swatch"
          aria-checked={props.value === color}
          aria-label={color}
          style={{ background: color }}
          onClick={() => props.onChange(color)}
        />
      ))}
    </div>
  )
}
