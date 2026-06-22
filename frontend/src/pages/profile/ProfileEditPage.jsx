import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyProfile, updateProfile } from '../../api/profilesApi';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import Chip from '../../components/ui/Chip';
import FormInput from '../../components/ui/FormInput';

const TAGS = ['#photography', '#music', '#cooking', '#travel', '#reading', '#cycling', '#art', '#tech', '#yoga', '#film', '#plants', '#coffee'];
const GENDERS = ['Man', 'Woman', 'Non-binary', 'Other'];
const PREFS = ['Men', 'Women', 'Everyone'];

function Section({ children, style }) {
  return (
    <div style={{
      background: 'var(--white)',
      borderRadius: 'var(--r-md)',
      padding: 16,
      marginBottom: 14,
      border: '1.5px solid var(--cream3)',
      ...style,
    }}>
      {children}
    </div>
  );
}

export default function ProfileEditPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', email: '',
    gender: '', preference: '', bio: '', tags: [], location: '',
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProfile()
      .then(data => {
        setProfile(data);
        setForm({
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          username: data.username || '',
          email: data.email || '',
          gender: data.gender || '',
          preference: data.sexual_preference || '',
          bio: data.biography || '',
          tags: data.tags || [],
          location: data.location_label || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    try {
      await updateProfile({
        first_name: form.firstName,
        last_name: form.lastName,
        biography: form.bio,
        gender: form.gender,
        sexual_preference: form.preference,
        tags: form.tags.map(t => t.replace('#', '')),
        location_label: form.location,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const name = form.firstName || profile?.username || user?.username || 'You';

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MatchaCup size={28} mood="happy" animate={false}/> My profile
        </div>
        <Btn variant="ghost" onClick={handleLogout} style={{ fontSize: 13, color: 'var(--ink4)' }}>Sign out</Btn>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MatchaCup size={60} mood="happy" animate={true} style={{ animation: 'float 3s ease-in-out infinite' }}/>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 24px' }}>

          <Section style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Avatar name={name} size={64}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>{form.location || 'No location set'}</div>
            </div>
            <FameMeter score={profile?.fame_rating || 0} size="lg"/>
          </Section>

          <Section>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>
              Photos <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({profile?.photos?.length || 0}/5)</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const photo = profile?.photos?.[i];
                return (
                  <div key={i} style={{
                    width: 52, height: 52, borderRadius: 'var(--r-sm)',
                    background: photo ? `url(${photo.url}) center/cover` : 'var(--cream)',
                    border: `1.5px dashed ${photo ? 'var(--clay)' : 'var(--sand)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, color: photo ? 'var(--clay)' : 'var(--sand)',
                    cursor: 'pointer', overflow: 'hidden',
                  }}>
                    {!photo && (i < (profile?.photos?.length || 0) ? '◎' : '+')}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 8 }}>First photo is your profile picture</div>
          </Section>

          <Section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <FormInput label="First name" value={form.firstName} onChange={e => setField('firstName', e.target.value)} style={{ flex: 1 }}/>
              <FormInput label="Last name" value={form.lastName} onChange={e => setField('lastName', e.target.value)} style={{ flex: 1 }}/>
            </div>
            <FormInput label="Username" value={form.username} onChange={e => setField('username', e.target.value)}/>
            <FormInput label="Email" type="email" value={form.email} onChange={e => setField('email', e.target.value)}/>
          </Section>

          <Section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 8 }}>I am</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {GENDERS.map(g => <Chip key={g} label={g} active={form.gender === g} onClick={() => setField('gender', g)}/>)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 8 }}>Interested in</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PREFS.map(p => <Chip key={p} label={p} active={form.preference === p} onClick={() => setField('preference', p)}/>)}
              </div>
            </div>
          </Section>

          <Section>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 8 }}>Bio</div>
            <textarea
              value={form.bio}
              onChange={e => setField('bio', e.target.value.slice(0, 300))}
              rows={4}
              style={{
                width: '100%', padding: '12px', borderRadius: 'var(--r-sm)',
                background: 'var(--cream)', border: '1.5px solid var(--sand)',
                color: 'var(--ink)', fontSize: 14, resize: 'none', lineHeight: 1.6,
              }}
            />
            <div style={{ fontSize: 11, color: form.bio.length > 260 ? 'var(--rose)' : 'var(--ink4)', textAlign: 'right', marginTop: 4 }}>
              {form.bio.length}/300
            </div>
          </Section>

          <Section>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Interests</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TAGS.map(t => {
                const raw = t.replace('#', '');
                return <Chip key={t} label={t} active={form.tags.includes(raw)} onClick={() => setField('tags', form.tags.includes(raw) ? form.tags.filter(x => x !== raw) : [...form.tags, raw])}/>;
              })}
            </div>
          </Section>

          <Section>
            <FormInput
              label="Location"
              value={form.location}
              onChange={e => setField('location', e.target.value)}
              hint="Used for matching · updated with GPS if allowed"
            />
          </Section>

          <Section style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Activity</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[[profile?.views_count || 0, 'viewed you'], [profile?.likes_count || 0, 'liked you']].map(([n, l]) => (
                <div key={l} style={{ flex: 1, textAlign: 'center', padding: '12px', background: 'var(--cream)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: 'var(--spice)' }}>{n}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </Section>

          <Btn onClick={handleSave} style={{ width: '100%' }}>
            {saved ? '✓ Saved!' : 'Save changes'}
          </Btn>
        </div>
      )}
    </div>
  );
}
