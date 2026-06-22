const VARIANTS = {
  primary:   { background: 'var(--spice)',  color: '#fff', boxShadow: '0 4px 16px rgba(194,120,74,.35)', border: 'none' },
  secondary: { background: 'var(--cream2)', color: 'var(--ink2)', border: '1.5px solid var(--sand)' },
  ghost:     { background: 'transparent',   color: 'var(--ink3)', border: 'none', padding: '10px 16px' },
  danger:    { background: '#fde8e8',       color: '#c04a4a', border: '1.5px solid #f5c5c5' },
  matcha:    { background: 'var(--matcha)', color: '#fff', boxShadow: '0 4px 16px rgba(107,143,94,.35)', border: 'none' },
};

function Btn({ children, variant = 'primary', onClick, style = {}, disabled = false, type = 'button' }) {
  const base = {
    padding: '13px 28px',
    borderRadius: 'var(--r-full)',
    fontSize: 15,
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all .18s',
    fontFamily: 'DM Sans, sans-serif',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...VARIANTS[variant], ...style }}
    >
      {children}
    </button>
  );
}

export default Btn;
