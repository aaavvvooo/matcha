import { useState } from 'react';
import { MapPin, LocateFixed, Check } from 'lucide-react';
import Btn from './Btn';
import { setLocation } from '../../api/profilesApi';

function LocationPicker({ locationLabel, onSaved }) {
  const [mode, setMode] = useState(null); // 'gps' | 'manual' | null
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState(null);
  const [savedLabel, setSavedLabel] = useState(locationLabel);

  async function handleUseGps() {
    setMode('gps');
    setStatus('loading');
    setError(null);
    if (!navigator.geolocation) {
      setStatus('error');
      setError('Your browser does not support GPS location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setStatus('idle');
          setSavedLabel(result?.location_label);
          onSaved?.(result);
        } catch (err) {
          setStatus('error');
          setError(err?.response?.data?.detail || 'Failed to save your location.');
        }
      },
      () => {
        setStatus('error');
        setError('Location permission denied. Enter your city instead.');
        setMode('manual');
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  async function handleSaveCity() {
    if (!city.trim()) return;
    setStatus('loading');
    setError(null);
    try {
      const result = await setLocation({ city: city.trim() });
      setStatus('idle');
      setCity('');
      setSavedLabel(result?.location_label);
      onSaved?.(result);
    } catch (err) {
      setStatus('error');
      setError(err?.response?.data?.detail || 'Could not find that location.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {savedLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink2)' }}>
          <Check size={15} color="var(--matcha2)"/> Current location: <b>{savedLabel}</b>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn
          variant="secondary"
          onClick={handleUseGps}
          disabled={status === 'loading' && mode === 'gps'}
          style={{ flex: 1, fontSize: 13 }}
        >
          <LocateFixed size={15}/> {status === 'loading' && mode === 'gps' ? 'Locating…' : 'Share GPS location'}
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => setMode('manual')}
          style={{ flex: 1, fontSize: 13 }}
        >
          <MapPin size={15}/> Enter city
        </Btn>
      </div>

      {mode === 'manual' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveCity()}
            placeholder="City or neighborhood"
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 'var(--r-sm)',
              background: 'var(--white)', border: '1.5px solid var(--sand)',
              color: 'var(--ink)', fontSize: 14,
            }}
          />
          <Btn onClick={handleSaveCity} disabled={status === 'loading' || !city.trim()} style={{ fontSize: 13 }}>
            {status === 'loading' ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--rose)' }}>{error}</div>
      )}
    </div>
  );
}

export default LocationPicker;
