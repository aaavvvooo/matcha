import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { register } from '../../api/authApi';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import FormInput from '../../components/ui/FormInput';
import OAuthButtons from '../../components/auth/OAuthButtons';
import { USERNAME_HINT } from '../../utils/username';
import {
  confirmError, emailError, nameError, passwordError, required, usernameError,
} from '../../utils/formValidation';

// Lets password managers and the browser fill each field correctly.
const AUTOCOMPLETE = {
  firstName: 'given-name', lastName: 'family-name', username: 'username', email: 'email',
  password: 'new-password', confirmPassword: 'new-password',
};

const STEPS = [
  { title: 'Your name',      fields: ['firstName', 'lastName'],     placeholders: ['First name', 'Last name'],     types: ['text', 'text'] },
  { title: 'Account details', fields: ['username', 'email'],         placeholders: ['Username', 'Email address'],   types: ['text', 'email'] },
  { title: 'Set a password', fields: ['password', 'confirmPassword'], placeholders: ['Choose a strong password', 'Confirm password'], types: ['password', 'password'] },
];

function RegisterPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Shown while typing; "Required" for empty fields is added when the user tries to continue.
  const liveErrors = {
    firstName: nameError(form.firstName),
    lastName: nameError(form.lastName),
    username: usernameError(form.username),
    email: emailError(form.email),
    password: passwordError(form.password),
    confirmPassword: confirmError(form.password, form.confirmPassword),
  };

  function validate() {
    const e = {};
    for (const f of STEPS[step].fields) {
      const msg = liveErrors[f] || required(form[f]);
      if (msg) e[f] = msg;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleNext() {
    if (!validate()) return;
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    setLoading(true);
    try {
      await register(
        form.firstName.trim(),
        form.lastName.trim(),
        form.username,
        form.email,
        form.password,
        form.confirmPassword,
      );
      setSuccess(true);
    } catch (err) {
      setErrors({ submit: err.message || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 20 }}>
        <MatchaCup size={72} mood="excited" animate={true}/>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 28, fontWeight: 700, color: 'var(--ink)', textAlign: 'center' }}>Check your email</div>
        <div style={{ fontSize: 15, color: 'var(--ink3)', textAlign: 'center', lineHeight: 1.6 }}>
          We sent a verification link to <strong>{form.email}</strong>.<br/>Click it to activate your account.
        </div>
        <Btn variant="secondary" onClick={() => navigate('/login')}>Back to Sign in</Btn>
      </div>
    );
  }

  const rs = STEPS[step];

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
        >←</button>
        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i <= step ? 'var(--spice)' : 'var(--sand)',
              transition: 'all .3s',
            }}/>
          ))}
        </div>
        <div style={{ width: 24 }}/>
      </div>

      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 6 }}>
            {step + 1} OF {STEPS.length}
          </div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 30, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}>
            {rs.title}
          </div>
        </div>

        {rs.fields.map((f, i) => (
          <FormInput
            key={f}
            type={rs.types[i]}
            value={form[f]}
            onChange={e => {
              setField(f, e.target.value);
              // Editing a field clears its "Required"; live checks take over from here.
              setErrors(prev => {
                const next = { ...prev };
                delete next[f];
                return next;
              });
            }}
            placeholder={rs.placeholders[i]}
            aria-label={rs.placeholders[i]}
            autoComplete={AUTOCOMPLETE[f]}
            error={liveErrors[f] || errors[f]}
            hint={f === 'username' ? USERNAME_HINT : undefined}
          />
        ))}

        {errors.submit && (
          <div style={{ fontSize: 13, color: 'var(--rose)', padding: '10px 14px', background: '#fdf0f0', borderRadius: 'var(--r-sm)', border: '1px solid #f5c5c5' }}>
            {errors.submit}
          </div>
        )}

        <Btn onClick={handleNext} disabled={loading} style={{ marginTop: 'auto' }}>
          {loading ? 'Creating…' : step < STEPS.length - 1 ? 'Continue →' : 'Create account'}
        </Btn>
        {step === 0 && <OAuthButtons />}
      </div>

      <div style={{ padding: '12px 24px 32px', textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
        Already have an account?{' '}
        <span onClick={() => navigate('/login')} style={{ color: 'var(--spice)', cursor: 'pointer', fontWeight: 500 }}>Sign in</span>
      </div>
    </div>
  );
}

export default RegisterPage;
