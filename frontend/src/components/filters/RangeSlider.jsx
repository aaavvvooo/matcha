/** Two handles on one track. Plain numbers in and out; the handles cannot cross. */
function RangeSlider({ floor, ceil, step = 1, low, high, onChange, lowLabel, highLabel, valueText }) {
  const percent = n => ((n - floor) / (ceil - floor)) * 100;
  return (
    <div
      className="range-slider"
      style={{ '--low': percent(low) / 100, '--high': percent(high) / 100 }}
    >
      <div className="range-slider-track"/>
      <input
        type="range"
        // Both handles at the far end: the low one must stay on top, or neither could move.
        className={low > (floor + ceil) / 2 ? 'range-slider-top' : undefined}
        min={floor}
        max={ceil}
        step={step}
        value={low}
        aria-label={lowLabel}
        aria-valuetext={valueText?.(low)}
        onChange={e => onChange(Math.min(Number(e.target.value), high), high)}
      />
      <input
        type="range"
        min={floor}
        max={ceil}
        step={step}
        value={high}
        aria-label={highLabel}
        aria-valuetext={valueText?.(high)}
        onChange={e => onChange(low, Math.max(Number(e.target.value), low))}
      />
    </div>
  );
}

export default RangeSlider;
