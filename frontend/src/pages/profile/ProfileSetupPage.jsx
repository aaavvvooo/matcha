import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkle } from 'lucide-react';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import LocationPicker from '../../components/ui/LocationPicker';
import { apiError } from '../../api/errors';
import { setProfile, getAllTags, getMyProfile, deletePhotos, setProfilePic } from '../../api/profilesApi';
import { birthDateError, isoYearsAgo, MAX_AGE, MIN_AGE, tagsError } from '../../utils/formValidation';
import { MAX_PHOTOS } from '../../utils/photoFiles';
import PhotoGallery from './PhotoGallery';

const STEPS = [
  { title: 'When were you born?', subtitle: 'You must be 18 or older to use Matcha.' },
  { title: 'Who are you?', subtitle: 'This helps us show you to the right people.' },
  { title: 'Who interests you?', subtitle: 'You can always change this later.' },
  { title: 'Your story.', subtitle: 'Make it yours. Keep it real.' },
  { title: 'Your interests.', subtitle: 'Pick at least 3 to get better matches.' },
  { title: 'Where are you?', subtitle: 'Needed to show you people nearby — with your consent.' },
  { title: 'Add a photo.', subtitle: "You won't be able to like anyone without one — but you can skip this for now." },
];

// Module scope: defined inside the page it would be a new component type on every render,
// remounting the buttons and dropping keyboard focus after each pick.
function OptionBtn({ selected, onClick, children }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} style={{
      padding: '15px 20px',
      textAlign: 'left',
      background: selected ? 'var(--spice)' : 'var(--white)',
      border: `1.5px solid ${selected ? 'var(--spice)' : 'var(--sand)'}`,
      borderRadius: 'var(--r-md)',
      color: selected ? 'var(--white)' : 'var(--ink2)',
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
      {selected && <Check size={16} aria-hidden="true"/>}
    </button>
  );
}

function ProfileSetupPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ birth_date: '', gender: '', sexual_orientation: '', bio: '', tags: [] });
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [profileCreated, setProfileCreated] = useState(false);
  const [locationSet, setLocationSet] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const deletingRef = useRef(false);
  // Set once the user changes the gallery, so a late initial load can't overwrite it.
  const photosTouchedRef = useRef(false);
  const navigate = useNavigate();

  const locationStep = STEPS.length - 2;
  const photoStep = STEPS.length - 1;
  const profileCreationStep = STEPS.length - 3;

  useEffect(() => {
    getAllTags().then(setAvailableTags).catch(() => {});
  }, []);

  // Photos may already exist (reload, or coming back to setup): start from the real gallery,
  // or the 5-photo count and the "first photo becomes the profile picture" rule go wrong.
  useEffect(() => {
    if (step !== photoStep) return undefined;
    let cancelled = false;
    getMyProfile()
      .then(p => { if (!cancelled && !photosTouchedRef.current) setPhotos(p.photos || []); })
      .catch(() => { if (!cancelled) setPhotoError("Couldn't load your photos — reload the page to try again"); });
    return () => { cancelled = true; };
  }, [step, photoStep]);

  function handlePhotosChange(list) {
    photosTouchedRef.current = true;
    setPhotos(list);
  }

  const birthError = birthDateError(data.birth_date);
  const tagsMsg = tagsError(data.tags);

  // PhotoGallery uploads (up to MAX_PHOTOS) and makes the first photo the profile picture.
  async function handleMakeMain(photo) {
    if (photo.is_main) return;
    setPhotoError(null);
    try {
      await setProfilePic(photo.id);
      setPhotos(list => list.map(p => ({ ...p, is_main: p.id === photo.id })));
    } catch (err) {
      setPhotoError(apiError(err, 'Could not set the profile picture — try again'));
    }
  }

  async function handlePhotoDelete(photoId) {
    // A double-click would send a second delete for a photo that is already gone (404).
    if (deletingRef.current) return;
    deletingRef.current = true;
    photosTouchedRef.current = true;
    setPhotoError(null);
    try {
      await deletePhotos([photoId]);
      setPhotos(list => list.filter(p => p.id !== photoId));
      // Decide the new profile picture from the server, not from the list as it was at click
      // time: an upload or another pick may have landed while the delete was in flight.
      const fresh = (await getMyProfile()).photos || [];
      setPhotos(fresh);
      if (fresh.length > 0 && !fresh.some(p => p.is_main)) await handleMakeMain(fresh[0]);
    } catch (err) {
      setPhotoError(apiError(err, 'Could not delete the photo — try again'));
    } finally {
      deletingRef.current = false;
    }
  }

  async function handleContinue() {
    if (step === photoStep) {
      navigate('/browse');
      return;
    }

    if (step === locationStep) {
      setStep(s => s + 1);
      return;
    }

    if (step === profileCreationStep) {
      setLoading(true);
      setError(null);
      try {
        await setProfile({
          bio: data.bio,
          gender: data.gender,
          birth_date: data.birth_date ? new Date(data.birth_date).toISOString() : null,
          sexual_orientation: data.sexual_orientation,
          tags: data.tags,
        });
        setProfileCreated(true);
        setStep(s => s + 1);
      } catch (e) {
        // apiError flattens a 422's list of objects; rendering it raw would crash the page.
        setError(apiError(e, 'Something went wrong. Please try again.'));
      } finally {
        setLoading(false);
      }
      return;
    }

    setStep(s => s + 1);
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
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
          <>
          <input
            type="date"
            aria-label="Birth date"
            value={data.birth_date}
            max={isoYearsAgo(MIN_AGE)}
            min={isoYearsAgo(MAX_AGE)}
            onChange={e => setData(d => ({ ...d, birth_date: e.target.value }))}
            aria-invalid={birthError ? true : undefined}
            aria-describedby="birth-date-error"
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'var(--white)',
              border: `1.5px solid ${birthError ? 'var(--danger-fg)' : 'var(--sand)'}`,
              borderRadius: 'var(--r-md)',
              color: data.birth_date ? 'var(--ink)' : 'var(--ink4)',
              fontSize: 15,
              fontFamily: 'DM Sans, sans-serif',
              boxSizing: 'border-box',
            }}
          />
          <div id="birth-date-error" aria-live="polite" style={{ fontSize: 12, color: 'var(--danger-fg)', marginTop: 8, minHeight: 16 }}>
            {birthError}
          </div>
          </>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Man', 'Woman', 'Non-binary', 'Other'].map(g => (
              <OptionBtn key={g} selected={data.gender === g} onClick={() => setData(d => ({ ...d, gender: g }))}>
                {g}
              </OptionBtn>
            ))}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Heterosexual', 'Homosexual', 'Bisexual', 'Other'].map(p => (
              <OptionBtn
                key={p}
                selected={data.sexual_orientation === p}
                onClick={() => setData(d => ({ ...d, sexual_orientation: p }))}
              >
                {p}
              </OptionBtn>
            ))}
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>We respect all orientations.</div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              aria-label="Bio"
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
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Sparkle size={13} style={{ flexShrink: 0 }}/> Tip: Keep it honest. The best bios are 1–2 sentences that actually sound like you.
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={data.tags.includes(tag.id)}
                  onClick={() => setData(d => ({
                    ...d,
                    tags: d.tags.includes(tag.id) ? d.tags.filter(t => t !== tag.id) : [...d.tags, tag.id],
                  }))}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--r-full)',
                    background: data.tags.includes(tag.id) ? 'var(--spice)' : 'var(--white)',
                    border: `1.5px solid ${data.tags.includes(tag.id) ? 'var(--spice)' : 'var(--sand)'}`,
                    color: data.tags.includes(tag.id) ? '#fff' : 'var(--ink2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all .18s',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
            <div aria-live="polite" style={{ fontSize: 12, color: tagsMsg ? 'var(--danger-fg)' : 'var(--ink4)' }}>
              {data.tags.length} selected · {tagsMsg || 'looking good'}
            </div>
          </div>
        )}

        {step === locationStep && profileCreated && (
          <LocationPicker onSaved={() => setLocationSet(true)}/>
        )}

        {step === photoStep && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PhotoGallery
              photos={photos}
              onPhotosChange={handlePhotosChange}
              onOpen={handleMakeMain}
              onDelete={handlePhotoDelete}
              openLabel="Make profile picture: photo"
            />
            <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
              {photos.length > 0 && <><Check size={12} aria-hidden="true"/> {photos.length} of {MAX_PHOTOS} added · </>}
              Add up to {MAX_PHOTOS} photos. Tap one to make it your profile picture.
            </div>
            {photoError && (
              <div role="alert" style={{ fontSize: 12, color: 'var(--rose)', textAlign: 'center' }}>{photoError}</div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-fg)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--danger-fg)' }} role="alert">
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 24px 28px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {step > 0 && !profileCreated && (
          <Btn variant="secondary" onClick={() => setStep(s => s - 1)} style={{ flex: 1 }}>← Back</Btn>
        )}
        <Btn
          onClick={handleContinue}
          style={{ flex: 2 }}
          disabled={
            loading ||
            (step === 0 && (!data.birth_date || Boolean(birthError))) ||
            (step === 1 && !data.gender) ||
            (step === 2 && !data.sexual_orientation) ||
            (step === 4 && Boolean(tagsMsg)) ||
            (step === locationStep && !locationSet)
          }
        >
          {loading
            ? 'Saving...'
            : step === photoStep
              ? (photos.length > 0 ? 'Finish setup →' : 'Skip for now →')
              : 'Continue →'}
        </Btn>
      </div>
    </div>
  );
}

export default ProfileSetupPage;
