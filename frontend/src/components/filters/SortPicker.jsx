import { Cake, CupSoda, Hash, MapPin, Sparkle } from 'lucide-react';
import { SORTS } from './sorts';
import './filterControls.css';

const ICONS = { score: Sparkle, distance: MapPin, age: Cake, fame: CupSoda, tags: Hash };
const SHORT_LABELS = { score: 'Best', tags: 'Tags' };

const capitalize = text => text[0].toUpperCase() + text.slice(1);

/** Every sort in one row, for narrow screens. `value` is a key of SORTS. */
function SortPicker({ value, onChange, className = '' }) {
  const current = SORTS.find(([key]) => key === value)?.[1] ?? '';
  return (
    <section className={`filter-control sort-picker ${className}`} role="group" aria-label="Sort by">
      <header className="filter-control-head">
        <h3 className="filter-control-label">Sort by</h3>
        <output className="filter-control-value">{capitalize(current)}</output>
      </header>
      <div className="sort-options">
        {SORTS.map(([key, label]) => {
          const Icon = ICONS[key];
          return (
            <button
              key={key}
              type="button"
              className="sort-option"
              aria-label={label}
              aria-pressed={value === key}
              onClick={() => onChange(key)}
            >
              <Icon size={19} strokeWidth={1.75} aria-hidden="true"/>
              <span>{SHORT_LABELS[key] ?? capitalize(label)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default SortPicker;
