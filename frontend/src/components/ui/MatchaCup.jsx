function MatchaCup({ size = 80, mood = 'happy', animate = true, style: extraStyle = {} }) {
  const s = size;
  const h = size * 110 / 80;

  const eyes = {
    happy:   { type: 'arc',   lx: 28, ly: 66, rx: 52, ry: 66 },
    shy:     { type: 'arc',   lx: 28, ly: 66, rx: 52, ry: 66, blush: true },
    excited: { type: 'dot',   lx: 28, ly: 65, rx: 52, ry: 65 },
    sleepy:  { type: 'line',  lx: 28, ly: 66, rx: 52, ry: 66, zzz: true },
    love:    { type: 'heart', lx: 28, ly: 64, rx: 52, ry: 64 },
  };
  const e = eyes[mood] || eyes.happy;

  return (
    <svg viewBox="0 0 80 110" width={s} height={h} style={{ display: 'block', overflow: 'visible', ...extraStyle }}>
      <defs>
        <linearGradient id={`cupBody_${mood}_${size}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0"   stopColor="#d4f0c8"/>
          <stop offset="0.4" stopColor="#e8f8dc"/>
          <stop offset="1"   stopColor="#c0e4b0"/>
        </linearGradient>
        <linearGradient id={`lidGrad_${mood}_${size}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0"   stopColor="#b8d4a8"/>
          <stop offset="0.5" stopColor="#cce8b8"/>
          <stop offset="1"   stopColor="#a8c898"/>
        </linearGradient>
      </defs>

      {/* straw */}
      <rect x="50" y="2" width="5" height="42" rx="2.5" fill="#a8d898" stroke="#7ab568" strokeWidth="0.8"/>
      <rect x="51.5" y="2" width="2" height="42" rx="1" fill="white" opacity=".35"/>

      {/* lid */}
      <ellipse cx="40" cy="30" rx="26" ry="7" fill={`url(#lidGrad_${mood}_${size})`} stroke="#7ab568" strokeWidth="1.2"/>
      <path d="M14 30 Q14 38 17 40 L63 40 Q66 38 66 30" fill={`url(#lidGrad_${mood}_${size})`} stroke="#7ab568" strokeWidth="1.2"/>
      <ellipse cx="40" cy="40" rx="23" ry="6" fill="#b8dca8" stroke="#7ab568" strokeWidth="1"/>
      <ellipse cx="30" cy="29" rx="5" ry="2.5" fill="#7ab568" opacity=".6"/>
      <ellipse cx="30" cy="29" rx="3.5" ry="1.5" fill="#5a9450"/>

      {/* cup body */}
      <path d="M17 40 L13 98 Q13 104 40 104 Q67 104 67 98 L63 40 Z" fill={`url(#cupBody_${mood}_${size})`}/>
      <path d="M20 44 L17 90 Q17 93 22 95 L24 48 Z" fill="white" opacity=".25"/>
      <path d="M17 40 L13 98 Q13 104 40 104 Q67 104 67 98 L63 40 Z" fill="none" stroke="#7ab568" strokeWidth="1.5"/>

      {/* sleeve band */}
      <path d="M15 62 L13 78 Q13 79 14 79 L66 79 Q67 79 67 78 L65 62 Z" fill="#c8924a" opacity=".18"/>
      <path d="M15 62 L65 62" stroke="#c8924a" strokeWidth="1" opacity=".4"/>
      <path d="M13 78 L67 78" stroke="#c8924a" strokeWidth="1" opacity=".4"/>

      {/* logo dot */}
      <circle cx="40" cy="86" r="5" fill="#7ab568" opacity=".25"/>
      <circle cx="40" cy="86" r="3" fill="#7ab568" opacity=".3"/>

      {/* bottom */}
      <ellipse cx="40" cy="104" rx="27" ry="5" fill="#b8dca8" stroke="#7ab568" strokeWidth="1"/>
      <ellipse cx="40" cy="108" rx="22" ry="3.5" fill="#4a3828" opacity=".1"/>

      {/* eyes */}
      {e.type === 'arc' && (
        <>
          <path d={`M${e.lx-5} ${e.ly} Q${e.lx} ${e.ly-6} ${e.lx+5} ${e.ly}`}
            fill="none" stroke="#3a2818" strokeWidth="2.2" strokeLinecap="round"
            style={animate ? { animation: 'blink 3.5s ease-in-out infinite', transformOrigin: `${e.lx}px ${e.ly}px` } : {}}/>
          <path d={`M${e.rx-5} ${e.ry} Q${e.rx} ${e.ry-6} ${e.rx+5} ${e.ry}`}
            fill="none" stroke="#3a2818" strokeWidth="2.2" strokeLinecap="round"
            style={animate ? { animation: 'blink 3.5s .06s ease-in-out infinite', transformOrigin: `${e.rx}px ${e.ry}px` } : {}}/>
        </>
      )}
      {e.type === 'dot' && (
        <>
          <circle cx={e.lx} cy={e.ly} r="4" fill="#3a2818"/>
          <circle cx={e.rx} cy={e.ry} r="4" fill="#3a2818"/>
          <circle cx={e.lx+1.5} cy={e.ly-1.5} r="1.2" fill="white"/>
          <circle cx={e.rx+1.5} cy={e.ry-1.5} r="1.2" fill="white"/>
        </>
      )}
      {e.type === 'line' && (
        <>
          <path d={`M${e.lx-5} ${e.ly} Q${e.lx} ${e.ly+2} ${e.lx+5} ${e.ly}`}
            fill="none" stroke="#3a2818" strokeWidth="2.2" strokeLinecap="round"/>
          <path d={`M${e.rx-5} ${e.ry} Q${e.rx} ${e.ry+2} ${e.rx+5} ${e.ry}`}
            fill="none" stroke="#3a2818" strokeWidth="2.2" strokeLinecap="round"/>
        </>
      )}
      {e.type === 'heart' && (
        [e.lx, e.rx].map(cx => (
          <path key={cx} d={`M${cx} ${e.ly+2} Q${cx-4} ${e.ly-4} ${cx} ${e.ly-2} Q${cx+4} ${e.ly-4} ${cx} ${e.ly+2} Z`} fill="#e07a7a"/>
        ))
      )}

      {/* blush */}
      {e.blush && (
        <>
          <ellipse cx="18" cy="72" rx="5" ry="3.5" fill="#e07a7a" opacity=".3"/>
          <ellipse cx="62" cy="72" rx="5" ry="3.5" fill="#e07a7a" opacity=".3"/>
        </>
      )}

      {/* mouth */}
      {mood === 'sleepy'
        ? <path d="M35 74 Q40 75.5 45 74" fill="none" stroke="#3a2818" strokeWidth="1.8" strokeLinecap="round"/>
        : mood === 'excited'
        ? <path d="M33 74 Q40 82 47 74" fill="#3a2818"/>
        : <path d="M34 74 Q40 80 46 74" fill="none" stroke="#3a2818" strokeWidth="2" strokeLinecap="round"/>
      }

      {/* zzz */}
      {e.zzz && (
        <>
          <text x="66" y="56" fontSize="7" fill="#7ab568" fontWeight="bold" opacity=".9"
            style={{ animation: 'steam1 2s .2s ease-in-out infinite', transformOrigin: '66px 56px' }}>z</text>
          <text x="71" y="46" fontSize="9" fill="#7ab568" fontWeight="bold" opacity=".65"
            style={{ animation: 'steam1 2s .6s ease-in-out infinite', transformOrigin: '71px 46px' }}>z</text>
          <text x="76" y="34" fontSize="11" fill="#7ab568" fontWeight="bold" opacity=".4"
            style={{ animation: 'steam1 2s 1s ease-in-out infinite', transformOrigin: '76px 34px' }}>z</text>
        </>
      )}
    </svg>
  );
}

export default MatchaCup;
