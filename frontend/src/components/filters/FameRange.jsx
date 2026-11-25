import { useId } from 'react';
import { MAX_FAME } from '../../utils/formValidation';
import RangeSlider from './RangeSlider';
import './filterControls.css';

const LEVELS = ['Hidden gem', 'Rising', 'Known', 'Popular', 'Legend'];
const WIDTH = MAX_FAME / LEVELS.length;
const ANY = { min: '', max: '' };
// The drink inside the cup, in the cup's own coordinates.
const CUP_TOP = 10;
const CUP_BOTTOM = 44;

const toText = n => (n <= 0 || n >= MAX_FAME ? '' : String(n));

function readout(low, high) {
  if (low === 0 && high === MAX_FAME) return 'Any fame';
  const first = Math.min(Math.floor(low / WIDTH), LEVELS.length - 1);
  const last = Math.max(Math.ceil(high / WIDTH) - 1, first);
  return first === last ? LEVELS[first] : `${LEVELS[first]} to ${LEVELS[last]}`;
}

function Cup({ fill }) {
  const id = useId().replace(/[^\w-]/g, '');
  const level = CUP_BOTTOM - (CUP_BOTTOM - CUP_TOP) * fill;
  return (
    <svg viewBox="0 0 36 48" aria-hidden="true">
      <clipPath id={id}><path d="M6 10 L9 44 H27 L30 10 Z"/></clipPath>
      <path className="fame-cup-glass" d="M6 10 L9 44 H27 L30 10 Z"/>
      <rect className="fame-cup-drink" clipPath={`url(#${id})`} x="0" y={level} width="36" height={CUP_BOTTOM - level}/>
      <path className="fame-cup-line" d="M6 10 L9 44 H27 L30 10 Z M3.5 10 H32.5 M21 10 L24 1.5"/>
    </svg>
  );
}

/** Fame filter. `min` / `max` are strings, '' meaning no limit. */
function FameRange({ min, max, onChange }) {
  const low = min === '' ? 0 : Number(min);
  const high = max === '' ? MAX_FAME : Number(max);
  const isAny = low === 0 && high === MAX_FAME;
  return (
    <section className="filter-control">
      <header className="filter-control-head">
        <h3 className="filter-control-label">Fame</h3>
        <output className="filter-control-value">{readout(low, high)}</output>
      </header>
      <div className="fame-cups">
        {LEVELS.map((name, i) => {
          const from = i * WIDTH;
          const to = from + WIDTH;
          const picked = low === from && high === to;
          const inRange = low < to && high > from;
          return (
            <button
              key={name}
              type="button"
              className={`fame-cup${inRange && !isAny ? ' fame-cup--in' : ''}`}
              aria-label={`${name}, fame ${from} to ${to}`}
              aria-pressed={picked}
              title={name}
              onClick={() => onChange(picked ? ANY : { min: toText(from), max: toText(to) })}
            >
              <Cup fill={(i + 1) / LEVELS.length}/>
            </button>
          );
        })}
      </div>
      <RangeSlider
        floor={0}
        ceil={MAX_FAME}
        low={low}
        high={high}
        lowLabel="Min fame"
        highLabel="Max fame"
        onChange={(a, b) => onChange({ min: a <= 0 ? '' : String(a), max: b >= MAX_FAME ? '' : String(b) })}
      />
      <div className="filter-control-scale" aria-hidden="true"><span>{low}</span><span>{high}</span></div>
    </section>
  );
}

export default FameRange;
