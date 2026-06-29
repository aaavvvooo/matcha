import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyProfile, updateProfile, getAllTags } from '../../api/profilesApi';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import Chip from '../../components/ui/Chip';
import FormInput from '../../components/ui/FormInput';

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Other'];
const ORIENTATIONS = ['Heterosexual', 'Homosexual', 'Bisexual', 'Other'];

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
  const [availableTags, setAvailableTags] = useState([]);
  const [form, setForm] = useState({
    full_name: '', username: '', email: '',
    gender: '', sexual_orientation: '', bio: '', tags: [],
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMyProfile(user.id), getAllTags()])
      .then(([data, tags]) => {
        setProfile(data);
        setAvailableTags(tags);
        setForm({
          full_name: data.full_name || '',
          username: data.username || '',
          email: data.email || '',
          gender: data.gender || '',
          sexual_orientation: data.sexual_orientation || '',
          bio: data.bio || '',
          tags: data.tags || [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    try {
      await updateProfile({
        bio: form.bio,
        gender: form.gender,
        sexual_orientation: form.sexual_orientation,
        tags: form.tags ?? [],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const name = form.full_name || form.username || user?.username || 'You';

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
            <FormInput label="Full name" value={form.full_name} onChange={e => setField('full_name', e.target.value)}/>
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
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 8 }}>Sexual orientation</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ORIENTATIONS.map(o => <Chip key={o} label={o} active={form.sexual_orientation === o} onClick={() => setField('sexual_orientation', o)}/>)}
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
              {availableTags.map(tag => (
                <Chip
                  key={tag.id}
                  label={`#${tag.name}`}
                  active={form.tags.includes(tag.id)}
                  onClick={() => setField('tags', form.tags.includes(tag.id) ? form.tags.filter(x => x !== tag.id) : [...form.tags, tag.id])}
                />
              ))}
            </div>
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
