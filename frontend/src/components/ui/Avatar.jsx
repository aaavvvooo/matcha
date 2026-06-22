const AV_COLORS = [
  ['#f5dfd5', '#c2784a'],
  ['#d5e8d5', '#4e6e43'],
  ['#d5e0f5', '#4a6ea8'],
  ['#f5d5e8', '#a84a7a'],
  ['#f5f0d5', '#8a7a3a'],
  ['#d5f5f0', '#3a8a7a'],
];

function Avatar({ name, size = 44, online }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const [bg, fg] = AV_COLORS[(name || 'A').charCodeAt(0) % AV_COLORS.length];

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 600,
        fontFamily: 'Playfair Display, serif',
        letterSpacing: '0.02em',
        border: `2px solid ${bg}`,
        boxShadow: '0 2px 8px rgba(44,32,22,0.1)',
        flexShrink: 0,
      }}>
        {initials}
      </div>
      {online !== undefined && (
        <div style={{
          position: 'absolute',
          bottom: 1,
          right: 1,
          width: Math.max(8, size * 0.18),
          height: Math.max(8, size * 0.18),
          borderRadius: '50%',
          background: online ? '#6b9e6b' : 'var(--sand)',
          border: '2px solid var(--white)',
        }}/>
      )}
    </div>
  );
}

export default Avatar;
