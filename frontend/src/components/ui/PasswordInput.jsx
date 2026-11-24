import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

/** Password <input> with an eye button that shows or hides what was typed. All props go to the <input>. */
function PasswordInput({ style, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="password-input">
      {/* Shown as text, the value must still not reach spellcheckers or autocorrect. */}
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...inputProps}
        type={visible ? 'text' : 'password'}
        style={{ ...style, width: '100%', paddingRight: 48 }}
      />
      <button
        type="button"
        className="password-input-toggle"
        // Keeps focus in the field, so phones do not close the keyboard on every toggle.
        onMouseDown={e => e.preventDefault()}
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

export default PasswordInput;
