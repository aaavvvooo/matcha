import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, X } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import Btn from '../../components/ui/Btn';
import LocationPicker from '../../components/ui/LocationPicker';
import { getMapUsers, getMyProfile } from '../../api/profilesApi';
import { apiError } from '../../api/errors';
import './MapPage.css';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const WORLD_BOUNDS = [[-85, -180], [85, 180]];
const MAP_LIMIT = 200; // keep in sync with the backend cap
const DEBOUNCE_MS = 300;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round4 = (v) => Number(v.toFixed(4));

// Users sharing a grid cell share coordinates: group them, one marker per cell.
function groupByCell(users) {
  const cells = new Map();
  for (const u of users) {
    const key = `${u.latitude},${u.longitude}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(u);
  }
  return [...cells.values()];
}

// Marker icon built from DOM nodes (textContent / properties only: no user-controlled HTML).
function buildPinIcon(group) {
  const first = group[0];
  const root = document.createElement('div');
  root.className = 'map-pin';

  const face = document.createElement('div');
  face.className = 'map-pin-face';
  const initial = (first.first_name || first.username || '?').charAt(0).toUpperCase();
  if (first.photo_url) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.onerror = () => {
      img.remove();
      face.textContent = initial;
    };
    img.src = first.photo_url;
    face.appendChild(img);
  } else {
    face.textContent = initial;
  }
  root.appendChild(face);

  if (group.length === 1 && first.is_online) {
    const dot = document.createElement('span');
    dot.className = 'map-pin-online';
    root.appendChild(dot);
  }
  if (group.length > 1) {
    const badge = document.createElement('span');
    badge.className = 'map-pin-count';
    badge.textContent = String(group.length);
    root.appendChild(badge);
  }
  return L.divIcon({ html: root, className: 'map-pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22] });
}

function buildSelfIcon() {
  const root = document.createElement('div');
  root.className = 'map-self';
  root.textContent = 'You';
  return L.divIcon({ html: root, className: 'map-pin-wrap', iconSize: [40, 40], iconAnchor: [20, 20] });
}

export default function MapPage() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const selfMarkerRef = useRef(null);
  const homeRef = useRef(null);

  const [ready, setReady] = useState(false); // viewer's profile fetched
  const [home, setHome] = useState(null); // viewer's own position (shown to them only)
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // users in the clicked cell
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Viewer's stored position: where the map opens.
  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (cancelled) return;
        if (p?.latitude != null && p?.longitude != null) {
          const pos = { lat: p.latitude, lng: p.longitude };
          homeRef.current = pos;
          setHome(pos);
        } else {
          setPickerOpen(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(apiError(err, 'Could not load your profile.'));
        setPickerOpen(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Create the map once; destroy it on unmount.
  useEffect(() => {
    if (!ready || !containerRef.current) return undefined;
    const start = homeRef.current;
    const map = L.map(containerRef.current, {
      center: start ? [start.lat, start.lng] : [25, 10],
      zoom: start ? 11 : 2,
      minZoom: 2,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, noWrap: true }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    let timer = null;
    let controller = null;

    const load = async () => {
      const b = map.getBounds();
      const params = {
        min_lat: round4(clamp(b.getSouth(), -90, 90)),
        max_lat: round4(clamp(b.getNorth(), -90, 90)),
        min_lng: round4(clamp(b.getWest(), -180, 180)),
        max_lng: round4(clamp(b.getEast(), -180, 180)),
      };
      if (params.min_lat >= params.max_lat || params.min_lng >= params.max_lng) return;
      if (controller) controller.abort();
      const mine = new AbortController();
      controller = mine;
      setLoading(true);
      try {
        const data = await getMapUsers(params, mine.signal);
        if (mine.signal.aborted) return;
        setUsers(data);
        setError(null);
      } catch (err) {
        if (mine.signal.aborted || err?.code === 'ERR_CANCELED') return;
        setError(apiError(err, 'Could not load people on the map.'));
      } finally {
        if (controller === mine) setLoading(false);
      }
    };

    map.on('moveend', () => {
      clearTimeout(timer);
      timer = setTimeout(load, DEBOUNCE_MS);
    });
    map.on('click', () => setSelected(null));
    load();

    return () => {
      clearTimeout(timer);
      if (controller) controller.abort();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      selfMarkerRef.current = null;
    };
  }, [ready]);

  // One marker per grid cell.
  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const group of groupByCell(users)) {
      const first = group[0];
      const title = group.length > 1 ? `${group.length} people here` : first.first_name;
      L.marker([first.latitude, first.longitude], { icon: buildPinIcon(group), title, riseOnHover: true })
        .on('click', () => setSelected(group))
        .addTo(layer);
    }
  }, [users, ready]);

  // The viewer's own (exact) position, drawn for themselves only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selfMarkerRef.current) {
      selfMarkerRef.current.remove();
      selfMarkerRef.current = null;
    }
    if (home) {
      selfMarkerRef.current = L.marker([home.lat, home.lng], {
        icon: buildSelfIcon(),
        title: 'Your location',
        interactive: false,
        zIndexOffset: -1000,
      }).addTo(map);
    }
  }, [home, ready]);

  function handleLocationSaved(result) {
    if (result?.latitude == null || result?.longitude == null) return;
    const pos = { lat: result.latitude, lng: result.longitude };
    homeRef.current = pos;
    setHome(pos);
    setPickerOpen(false);
    mapRef.current?.flyTo([pos.lat, pos.lng], 11);
  }

  return (
    <div className="map-page">
      <h1 className="map-sr-only">People near you</h1>
      <div ref={containerRef} className="map-canvas" aria-label="Map of people nearby" />

      {!ready && <div className="map-status">Loading map…</div>}
      {ready && loading && <div className="map-status map-status--soft">Loading people…</div>}
      {ready && !loading && error && <div className="map-status map-status--error" role="alert">{error}</div>}
      {ready && !loading && !error && users.length >= MAP_LIMIT && (
        <div className="map-status map-status--soft">
          Showing the {MAP_LIMIT} most popular people here. Zoom in to see more.
        </div>
      )}

      <button
        type="button"
        className="map-fab"
        onClick={() => setPickerOpen((v) => !v)}
        aria-label="Set my location"
        aria-expanded={pickerOpen}
      >
        <LocateFixed size={20} />
      </button>

      {pickerOpen && (
        <section className="map-panel" aria-label="Set your location">
          <div className="map-panel-head">
            <b>{home ? 'Update your location' : 'Set your location to centre the map on you'}</b>
            <button type="button" className="map-icon-btn" onClick={() => setPickerOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <p className="map-panel-note">
            Others only ever see you within a ~2 km area, never your exact position.
          </p>
          <LocationPicker onSaved={handleLocationSaved} />
        </section>
      )}

      {selected && (
        <section className="map-card" aria-label="People in this area">
          <button type="button" className="map-icon-btn map-card-close" onClick={() => setSelected(null)} aria-label="Close">
            <X size={16} />
          </button>
          <ul className="map-card-list">
            {selected.map((u) => (
              <li key={u.user_id} className="map-card-row">
                <Avatar name={u.first_name} src={u.photo_url} size={52} online={u.is_online} />
                <div className="map-card-info">
                  <div className="map-card-name">
                    {u.first_name}{u.age != null ? `, ${u.age}` : ''}
                  </div>
                  <div className="map-card-meta">
                    {Math.round(u.fame_rating)} fame · {u.is_online ? 'online' : 'offline'}
                    {u.shared_tags > 0 ? ` · ${u.shared_tags} shared interest${u.shared_tags > 1 ? 's' : ''}` : ''}
                  </div>
                </div>
                <Btn onClick={() => navigate(`/profile/${u.user_id}`)} style={{ padding: '9px 16px', fontSize: 13 }}>
                  View
                </Btn>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
