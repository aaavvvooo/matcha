function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 13px',
        borderRadius: 'var(--r-full)',
        background: active ? 'var(--spice)' : 'var(--cream2)',
        border: `1.5px solid ${active ? 'var(--spice)' : 'var(--sand)'}`,
        color: active ? '#fff' : 'var(--ink2)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all .18s',
        whiteSpace: 'nowrap',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {label}
    </button>
  );
}

export default Chip;
