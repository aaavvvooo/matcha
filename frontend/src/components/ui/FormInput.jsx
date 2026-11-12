import { useId } from 'react';

function FormInput({ label, type = 'text', value, onChange, placeholder, hint, style = {} }) {
  // Ties the visible <label> to its <input> (click-to-focus, screen readers).
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)' }}>{label}</label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          padding: '13px 16px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--white)',
          border: '1.5px solid var(--sand)',
          color: 'var(--ink)',
          fontSize: 15,
          transition: 'border-color .15s',
          width: '100%',
        }}
      />
      {hint && <span style={{ fontSize: 12, color: 'var(--ink4)' }}>{hint}</span>}
    </div>
  );
}

export default FormInput;
