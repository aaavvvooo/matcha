import { MIN_AGE } from '../../utils/formValidation';
import RangeSlider from './RangeSlider';
import './filterControls.css';

const TOP_AGE = 80; // the far end of the scale: this age and over
const DECADES = [
  { label: '18–29', min: '', max: '29' },
  { label: '30s', min: '30', max: '39' },
  { label: '40s', min: '40', max: '49' },
  { label: '50s', min: '50', max: '59' },
  { label: '60+', min: '60', max: '' },
];
const ANY = { min: '', max: '' };

function readout(min, max) {
  if (!min && !max) return 'Any age';
  if (!max) return `${min} and over`;
  if (!min) return `Up to ${max}`;
  return min === max ? `Exactly ${min}` : `${min} to ${max}`;
}

/** Age filter. `min` / `max` are strings, '' meaning no limit. */
function AgeRange({ min, max, onChange }) {
  const low = min === '' ? MIN_AGE : Number(min);
  const high = max === '' ? TOP_AGE : Number(max);
  return (
    <section className="filter-control">
      <header className="filter-control-head">
        <h3 className="filter-control-label">Age</h3>
        <output className="filter-control-value">{readout(min, max)}</output>
      </header>
      <RangeSlider
        floor={MIN_AGE}
        ceil={TOP_AGE}
        low={low}
        high={high}
        lowLabel="Min age"
        highLabel="Max age"
        valueText={n => (n >= TOP_AGE ? `${TOP_AGE} and over` : `${n} years`)}
        onChange={(a, b) => onChange({
          min: a <= MIN_AGE ? '' : String(a),
          max: b >= TOP_AGE ? '' : String(b),
        })}
      />
      <div className="decades">
        {DECADES.map(d => {
          const picked = min === d.min && max === d.max;
          const inRange = low <= (d.max === '' ? TOP_AGE : Number(d.max)) && high >= (d.min === '' ? MIN_AGE : Number(d.min));
          return (
            <button
              key={d.label}
              type="button"
              className={`decade${inRange && (min || max) ? ' decade--in' : ''}`}
              aria-pressed={picked}
              onClick={() => onChange(picked ? ANY : { min: d.min, max: d.max })}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default AgeRange;
