import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyProfile, updateProfile, getAllTags, deletePhotos, setProfilePic } from '../../api/profilesApi';
import { updateMe } from '../../api/usersApi';
import { apiError } from '../../api/errors';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import Chip from '../../components/ui/Chip';
import FormInput from '../../components/ui/FormInput';
import LocationPicker from '../../components/ui/LocationPicker';
import { displayName } from '../../utils/displayName';
import { useLogout } from '../../hooks/useLogout';
import PhotoGallery from './PhotoGallery';

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Other'];
const ORIENTATIONS = ['Heterosexual', 'Homosexual', 'Bisexual', 'Other'];

function Section({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
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
  const { user } = useAuth();
  const handleLogout = useLogout();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [form, setForm] = useState({
    first_name: '', last_name: '', username: '', email: '',
    gender: '', sexual_orientation: '', bio: '', tags: [],
  });
  const [saved, setSaved] = useState(false);
  const [emailChangeNotice, setEmailChangeNotice] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [photoError, setPhotoError] = useState(null);

  const previewPhotos = profile?.photos || [];
  const previewIdx = previewPhoto ? previewPhotos.findIndex(p => p.id === previewPhoto.id) : -1;
  const goToPhoto = (i) => setPreviewPhoto(previewPhotos[(i + previewPhotos.length) % previewPhotos.length]);

  useEffect(() => {
    if (!previewPhoto) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') goToPhoto(previewIdx + 1);
      else if (e.key === 'ArrowLeft') goToPhoto(previewIdx - 1);
      else if (e.key === 'Escape') setPreviewPhoto(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPhoto, previewIdx]);

  useEffect(() => {
    Promise.all([getMyProfile(), getAllTags()])
      .then(([data, tags]) => {
        setProfile(data);
        setAvailableTags(tags);
        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handlePhotoDelete(photoId) {
    setPhotoError(null);
    try {
      await deletePhotos([photoId]);
      setProfile(p => ({ ...p, photos: p.photos.filter(ph => ph.id !== photoId) }));
      if (previewPhoto?.id === photoId) setPreviewPhoto(null);
    } catch (err) {
      setPhotoError(apiError(err, 'Could not delete the photo — try again'));
    }
  }

  async function handleSetProfilePic(photo) {
    setPhotoError(null);
    try {
      await setProfilePic(photo.id);
      setProfile(p => ({
        ...p,
        photos: p.photos.map(ph => ({ ...ph, is_main: ph.id === photo.id })),
      }));
      setPreviewPhoto(ph => ({ ...ph, is_main: true }));
    } catch (err) {
      setPhotoError(apiError(err, 'Could not set the profile picture — try again'));
    }
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await updateProfile({
        bio: form.bio,
        gender: form.gender,
        sexual_orientation: form.sexual_orientation,
        tags: form.tags ?? [],
      });

      const accountUpdates = {};
      if (form.first_name !== (profile?.first_name || '')) accountUpdates.first_name = form.first_name;
      if (form.last_name !== (profile?.last_name || '')) accountUpdates.last_name = form.last_name;
      if (form.email !== (profile?.email || '')) accountUpdates.email = form.email;
      let emailVerificationSent = false;
      if (Object.keys(accountUpdates).length > 0) {
        const updated = await updateMe(accountUpdates);
        if (updated.email_verification_sent) {
          emailVerificationSent = true;
          setEmailChangeNotice(true);
        }
      }

      setSaved(true);
      if (emailVerificationSent) {
        setTimeout(() => setSaved(false), 2000);
      } else {
        setTimeout(() => navigate(`/profile/${user.id}`), 800);
      }
    } catch (err) {
      setSaveError(apiError(err, 'Could not save your changes — try again'));
    }
  }

  const name = displayName(form, user?.username || 'You');

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(`/profile/${user.id}`)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MatchaCup size={28} mood="happy" animate={false}/> Settings
          </div>
        </div>
        <Btn variant="ghost" onClick={handleLogout} className="mobile-only" style={{ fontSize: 13, color: 'var(--ink4)' }}>Sign out</Btn>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MatchaCup size={60} mood="happy" animate={true} style={{ animation: 'float 3s ease-in-out infinite' }}/>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 24px' }}>

          <Section style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Avatar name={name} src={profile?.photos?.find(p => p.is_main)?.url} size={64}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>{profile?.location_label || 'No location set'}</div>
            </div>
            <FameMeter score={profile?.fame_rating || 0} size="lg"/>
          </Section>

          <Section>
            <PhotoGallery
              photos={profile?.photos || []}
              onPhotosChange={(photos) => setProfile(p => ({ ...p, photos }))}
              onOpen={setPreviewPhoto}
              onDelete={handlePhotoDelete}
            />
            {photoError && (
              <div className="error-msg" role="alert" style={{ marginTop: 10 }}>{photoError}</div>
            )}
          </Section>

          <Section>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Location</div>
            <LocationPicker
              locationLabel={profile?.location_label}
              onSaved={(result) => setProfile(p => ({ ...p, ...result }))}
            />
          </Section>

          <Section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormInput label="First name" value={form.first_name} onChange={e => setField('first_name', e.target.value)}/>
            <FormInput label="Last name" value={form.last_name} onChange={e => setField('last_name', e.target.value)}/>
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

          <Section
            onClick={() => navigate('/profile/blocked')}
            style={{ marginBottom: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)' }}>Blocked users</div>
            <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Manage →</div>
          </Section>

          {emailChangeNotice && (
            <div style={{
              fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic',
              textAlign: 'center', marginBottom: 10,
            }}>
              A verification link was sent to your new email. Please confirm it to keep using your account.
            </div>
          )}

          {saveError && (
            <div className="error-msg" role="alert" style={{ marginBottom: 10 }}>
              {saveError}
            </div>
          )}

          <Btn onClick={handleSave} style={{ width: '100%' }}>
            {saved ? <><Check size={16}/> Saved!</> : 'Save changes'}
          </Btn>
        </div>
      )}

      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}
        >
          {previewPhotos.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); goToPhoto(previewIdx - 1); }}
              style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                width: 44, height: 44, borderRadius: '50%', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >‹</button>
          )}
          <img
            src={previewPhoto.url}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 'var(--r-md)', objectFit: 'contain' }}
          />
          {previewPhotos.length > 1 && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
              {previewPhotos.map((p, i) => (
                <div key={p.id} onClick={() => goToPhoto(i)} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i === previewIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer', transition: 'background 0.2s',
                }}/>
              ))}
            </div>
          )}
          {previewPhotos.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); goToPhoto(previewIdx + 1); }}
              style={{
                position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                width: 44, height: 44, borderRadius: '50%', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >›</button>
          )}
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 10 }}>
            {!previewPhoto.is_main && (
              <button
                onClick={() => handleSetProfilePic(previewPhoto)}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)',
                  background: 'var(--spice)', border: 'none', color: '#fff',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >Set as profile picture</button>
            )}
            <button
              onClick={() => handlePhotoDelete(previewPhoto.id)}
              style={{
                padding: '10px 20px', borderRadius: 'var(--r-sm)',
                background: 'var(--rose)', border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}
            >Delete</button>
            <button
              onClick={() => setPreviewPhoto(null)}
              style={{
                padding: '10px 20px', borderRadius: 'var(--r-sm)',
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                fontSize: 14, cursor: 'pointer',
              }}
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
