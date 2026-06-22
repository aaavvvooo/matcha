import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';

const INTEREST_TAGS = ['#photography', '#music', '#cooking', '#travel', '#reading', '#cycling', '#art', '#tech', '#yoga', '#film', '#plants', '#coffee'];

const STEPS = [
  { title: 'Who are you?', subtitle: 'This helps us show you to the right people.' },
  { title: 'Who interests you?', subtitle: 'You can always change this later.' },
  { title: 'Your story.', subtitle: 'Make it yours. Keep it real.' },
  { title: 'Your interests.', subtitle: 'Pick at least 3 to get better matches.' },
];

function ProfileSetupPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ gender: '', prefs: [], bio: '', tags: [] });
  const navigate = useNavigate();

  function handleComplete() {
    navigate('/browse');
  }

  const OptionBtn = ({ value, selected, onClick, children }) => (
    <button onClick={onClick} style={{
      padding: '15px 20px',
      textAlign: 'left',
      background: selected ? 'var(--spice)' : 'var(--white)',
      border: `1.5px solid ${selected ? 'var(--spice)' : 'var(--sand)'}`,
      borderRadius: 'var(--r-md)',
      color: selected ? '#fff' : 'var(--ink2)',
      fontSize: 15,
      fontWeight: selected ? 500 : 400,
      cursor: 'pointer',
      transition: 'all .18s',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {children}
      {selected && <span style={{ fontSize: 16 }}>✓</span>}
    </button>
  );

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MatchaCup size={26} mood="happy" animate={false}/>Matcha
        </div>
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
      </div>

      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 8 }}>
          STEP {step + 1} / {STEPS.length}
        </div>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 30, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}>
          {STEPS[step].title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 6 }}>{STEPS[step].subtitle}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Man', 'Woman', 'Non-binary', 'Other'].map(g => (
              <OptionBtn key={g} selected={data.gender === g} onClick={() => setData(d => ({ ...d, gender: g }))}>
                {g}
              </OptionBtn>
            ))}
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Men', 'Women', 'Everyone'].map(p => (
              <OptionBtn
                key={p}
                selected={data.prefs.includes(p)}
                onClick={() => setData(d => ({
                  ...d,
                  prefs: d.prefs.includes(p) ? d.prefs.filter(x => x !== p) : [...d.prefs, p],
                }))}
              >
                {p}
              </OptionBtn>
            ))}
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>Select all that apply — we respect all orientations.</div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              value={data.bio}
              onChange={e => setData(d => ({ ...d, bio: e.target.value.slice(0, 300) }))}
              placeholder="What makes you, you?"
              rows={5}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--white)',
                border: '1.5px solid var(--sand)',
                borderRadius: 'var(--r-md)',
                color: 'var(--ink)',
                fontSize: 15,
                resize: 'none',
                lineHeight: 1.6,
              }}
            />
            <div style={{ fontSize: 12, color: data.bio.length > 260 ? 'var(--rose)' : 'var(--ink4)', textAlign: 'right' }}>
              {data.bio.length}/300
            </div>
            <div style={{
              padding: '12px 14px',
              background: 'var(--cream2)',
              borderRadius: 'var(--r-sm)',
              fontSize: 12,
              color: 'var(--ink3)',
              border: '1px solid var(--sand)',
            }}>
              ✦ Tip: Keep it honest. The best bios are 1–2 sentences that actually sound like you.
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {INTEREST_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setData(d => ({
                    ...d,
                    tags: d.tags.includes(tag) ? d.tags.filter(t => t !== tag) : [...d.tags, tag],
                  }))}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--r-full)',
                    background: data.tags.includes(tag) ? 'var(--spice)' : 'var(--white)',
                    border: `1.5px solid ${data.tags.includes(tag) ? 'var(--spice)' : 'var(--sand)'}`,
                    color: data.tags.includes(tag) ? '#fff' : 'var(--ink2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all .18s',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{data.tags.length} selected · min 3</div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ padding: '12px 24px 28px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {step > 0 && (
          <Btn variant="secondary" onClick={() => setStep(s => s - 1)} style={{ flex: 1 }}>← Back</Btn>
        )}
        <Btn
          onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : handleComplete()}
          style={{ flex: 2 }}
          disabled={
            (step === 0 && !data.gender) ||
            (step === 1 && data.prefs.length === 0) ||
            (step === 3 && data.tags.length < 3)
          }
        >
          {step < STEPS.length - 1 ? 'Continue →' : 'Finish setup →'}
        </Btn>
      </div>
    </div>
  );
}

export default ProfileSetupPage;
