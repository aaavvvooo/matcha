import { useId } from 'react';

/** Labelled input. `error` (string) marks it invalid and replaces the hint with the message. */
function FormInput({ label, type = 'text', value, onChange, onBlur, placeholder, hint, error, style = {} }) {
  // Ties the visible <label> to its <input> (click-to-focus, screen readers).
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
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
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        style={{
          padding: '13px 16px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--white)',
          border: `1.5px solid ${error ? 'var(--danger-fg)' : 'var(--sand)'}`,
          color: 'var(--ink)',
          fontSize: 15,
          transition: 'border-color .15s',
          width: '100%',
        }}
      />
      {note && (
        <span
          id={noteId}
          aria-live="polite"
          style={{ fontSize: 12, color: error ? 'var(--danger-fg)' : 'var(--ink4)' }}
        >
          {note}
        </span>
      )}
    </div>
  );
}

export default FormInput;
