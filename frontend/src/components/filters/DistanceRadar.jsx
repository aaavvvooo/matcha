import './filterControls.css';

// Short distances matter most, so the steps widen; the last one is no limit.
const STEPS_KM = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const ANYWHERE = STEPS_KM.length;
const PLACES = [
  [2, 'Around the corner'], [10, 'Across town'], [50, 'A short drive'], [250, 'A day trip'], [1000, 'A journey'],
];
const RINGS = [12, 22, 32, 42];
const SMALLEST_RADIUS = 7;
const LARGEST_RADIUS = 46;

// A stored value between two steps shows as the next one up, which still includes it.
const stepOf = km => {
  const index = STEPS_KM.findIndex(step => step >= km);
  return index === -1 ? ANYWHERE : index;
};

/** Distance filter. `value` is a string of kilometres, '' meaning anywhere. */
function DistanceRadar({ value, onChange }) {
  const step = value === '' ? ANYWHERE : stepOf(Number(value));
  const km = STEPS_KM[step];
  const text = km ? `Within ${km} km` : 'Anywhere';
  const place = km ? PLACES.find(([upTo]) => km <= upTo)[1] : 'No limit';
  const radius = SMALLEST_RADIUS + (LARGEST_RADIUS - SMALLEST_RADIUS) * (step / ANYWHERE);
  return (
    <section className="filter-control">
      <header className="filter-control-head">
        <h3 className="filter-control-label">Distance</h3>
        <output className="filter-control-value">{text}</output>
      </header>
      <div className="radar">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle
            className="radar-reach" cx="50" cy="50" r={LARGEST_RADIUS}
            style={{ transform: `scale(${radius / LARGEST_RADIUS})` }}
          />
          {RINGS.map(r => <circle key={r} className="radar-ring" cx="50" cy="50" r={r}/>)}
          <circle className="radar-you" cx="50" cy="50" r="4"/>
        </svg>
        <span className="radar-place">{place}</span>
      </div>
      <div className="range-slider range-slider--single" style={{ '--low': 0, '--high': step / ANYWHERE }}>
        <div className="range-slider-track"/>
        <input
          type="range"
          min={0}
          max={ANYWHERE}
          step={1}
          value={step}
          aria-label="Within km"
          aria-valuetext={text}
          onChange={e => {
            const next = Number(e.target.value);
            onChange(next >= ANYWHERE ? '' : String(STEPS_KM[next]));
          }}
        />
      </div>
    </section>
  );
}

export default DistanceRadar;
