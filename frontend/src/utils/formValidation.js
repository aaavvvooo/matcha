// Client-side checks so mistakes show while typing. Most mirror backend rules
// (backend/application/schema/fields.py, utils/password.py), which the server re-validates.
// Exceptions: MIN_TAGS is a UI-only nudge (the server only caps tags), and the server's
// zxcvbn strength score isn't mirrored (it still reports "not strong enough" on submit).
// Each check returns an error message, or null when the value is valid or still empty
// (an empty required field is reported by `required` when the user tries to continue).
import { USERNAME_HINT, USERNAME_RE } from './username';

export const MIN_AGE = 18;
export const MAX_AGE = 120;
export const MIN_TAGS = 3;
export const NAME_MAX = 50;
export const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const required = value => (String(value ?? '').trim() ? null : 'Required');

export function nameError(value) {
  if (!value) return null;
  if (!value.trim()) return 'Required';
  return value.trim().length > NAME_MAX ? `At most ${NAME_MAX} characters` : null;
}

export const usernameError = value => (!value || USERNAME_RE.test(value) ? null : USERNAME_HINT);

export const emailError = value => (!value || EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address');

// Same character classes as backend/application/utils/password.py validate_password.
const PASSWORD_SPECIAL_RE = /[!@#$%^&*(),.?":{}|<>]/;

export function passwordError(value) {
  if (!value) return null;
  if (value.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters`;
  if (!/[A-Z]/.test(value)) return 'Add an uppercase letter';
  if (!/[a-z]/.test(value)) return 'Add a lowercase letter';
  if (!PASSWORD_SPECIAL_RE.test(value)) return 'Add a special character, e.g. ! ? @ # $ %';
  return null;
}

export const confirmError = (password, confirm) =>
  !confirm || confirm === password ? null : 'Passwords do not match';

/** Whole years between `born` and `today` (local calendar). */
function ageOn(born, today) {
  const hadBirthday =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  return today.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
}

/** @param {string} value `YYYY-MM-DD` from a date input */
export function birthDateError(value, today = new Date()) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const born = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!born || born.getDate() !== Number(match[3])) return 'Enter a valid date';
  if (born >= today) return 'Your birth date must be in the past';
  const age = ageOn(born, today);
  if (age < MIN_AGE) return `You must be at least ${MIN_AGE} years old`;
  if (age > MAX_AGE) return `Enter a birth date within the last ${MAX_AGE} years`;
  return null;
}

/** @param {string[]} tags */
export function tagsError(tags) {
  const missing = MIN_TAGS - tags.length;
  return missing > 0 ? `Pick ${missing} more interest${missing === 1 ? '' : 's'}` : null;
}

// Discover / search filter bounds (backend/application/schema/discovery_schemas.py DiscoveryQuery).
export const MAX_DISTANCE_KM = 20000;
export const MAX_FAME = 100;

function boundError(raw, { min, max, integer = false, exclusiveMin = false }) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Enter a number';
  if (integer && !Number.isInteger(n)) return 'Whole numbers only';
  if (exclusiveMin ? n <= min : n < min) return exclusiveMin ? `More than ${min}` : `At least ${min}`;
  if (n > max) return `At most ${max}`;
  return null;
}

/**
 * Per-field errors for discover/search filters; keys with no problem are left out.
 * @param {{minAge?, maxAge?, maxDistance?, minFame?, maxFame?}} f raw input strings ('' = no bound)
 * @returns {Record<string, string>}
 */
export function filterErrors(f) {
  const errors = {
    minAge: boundError(f.minAge, { min: MIN_AGE, max: MAX_AGE, integer: true }),
    maxAge: boundError(f.maxAge, { min: MIN_AGE, max: MAX_AGE, integer: true }),
    maxDistance: boundError(f.maxDistance, { min: 0, max: MAX_DISTANCE_KM, exclusiveMin: true }),
    minFame: boundError(f.minFame, { min: 0, max: MAX_FAME }),
    maxFame: boundError(f.maxFame, { min: 0, max: MAX_FAME }),
  };
  const both = (a, b) => a !== '' && a != null && b !== '' && b != null;
  if (!errors.minAge && !errors.maxAge && both(f.minAge, f.maxAge) && Number(f.minAge) > Number(f.maxAge)) {
    errors.maxAge = 'Must be at least the min age';
  }
  if (!errors.minFame && !errors.maxFame && both(f.minFame, f.maxFame) && Number(f.minFame) > Number(f.maxFame)) {
    errors.maxFame = 'Must be at least the min fame';
  }
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}

/** `YYYY-MM-DD` for the date `years` ago, for date input min/max. */
export function isoYearsAgo(years, today = new Date()) {
  const d = new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
