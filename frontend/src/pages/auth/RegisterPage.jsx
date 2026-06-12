import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { register } from '../../api/authApi';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import FormInput from '../../components/ui/FormInput';

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

  function validate() {
    const e = {};
    if (step === 0) {
      if (!form.firstName.trim()) e.firstName = 'Required';
      if (!form.lastName.trim()) e.lastName = 'Required';
    }
    if (step === 1) {
      if (!form.username.trim()) e.username = 'Required';
      if (!form.email.includes('@')) e.email = 'Enter a valid email';
    }
    if (step === 2) {
      if (form.password.length < 8) e.password = 'Min 8 characters';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
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
        `${form.firstName} ${form.lastName}`,
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
            onChange={e => setField(f, e.target.value)}
            placeholder={rs.placeholders[i]}
            hint={errors[f]}
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
      </div>

      <div style={{ padding: '12px 24px 32px', textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
        Already have an account?{' '}
        <span onClick={() => navigate('/login')} style={{ color: 'var(--spice)', cursor: 'pointer', fontWeight: 500 }}>Sign in</span>
      </div>
    </div>
  );
}

export default RegisterPage;
