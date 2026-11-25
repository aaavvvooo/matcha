import { useEffect, useRef, useState } from 'react';
import './ActionsMenu.css';

/** A round button that opens a short list of actions above itself.
 * @param {{label: string, icon: React.ElementType, className?: string, align?: 'left'|'right',
 *   actions: {label: string, icon: React.ElementType, onSelect: () => void,
 *     danger?: boolean, disabled?: boolean}[]}} props */
function ActionsMenu({ label, icon: ToggleIcon, actions, className = '', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKeyDown = e => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`actions-menu ${className}`} ref={rootRef}>
      <button
        type="button"
        ref={toggleRef}
        className="actions-menu-toggle"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <ToggleIcon size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className={`actions-menu-list actions-menu-list--${align}`}>
          {actions.map(({ label: text, icon: Icon, onSelect, danger, disabled }) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              className={`actions-menu-item${danger ? ' actions-menu-item--danger' : ''}`}
              onClick={() => { setOpen(false); onSelect(); }}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ActionsMenu;
