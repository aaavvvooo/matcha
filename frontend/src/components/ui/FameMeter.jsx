function FameMeter({ score = 0, size = 'sm' }) {
  const pct = score / 100;
  const r = size === 'lg' ? 28 : 18;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width={r * 2 + 8} height={r * 2 + 8} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={r + 4} cy={r + 4} r={r} fill="none" stroke="var(--sand)" strokeWidth={size === 'lg' ? 4 : 3}/>
        <circle
          cx={r + 4} cy={r + 4} r={r}
          fill="none" stroke="var(--spice)"
          strokeWidth={size === 'lg' ? 4 : 3}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
        <text
          x={r + 4} y={r + 4}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fill: 'var(--ink2)',
            fontSize: size === 'lg' ? 11 : 9,
            fontWeight: 600,
            transform: 'rotate(90deg)',
            transformOrigin: `${r + 4}px ${r + 4}px`,
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {Math.round(score)}
        </text>
      </svg>
      {size === 'lg' && (
        <div style={{ fontSize: 11, color: 'var(--ink4)', fontFamily: 'DM Sans' }}>fame</div>
      )}
    </div>
  );
}

export default FameMeter;
