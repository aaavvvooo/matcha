import {
  birthDateError, confirmError, emailError, filterErrors, isoYearsAgo, nameError, passwordError, tagsError, usernameError,
} from './formValidation';

const today = new Date(2026, 10, 19); // 19 Nov 2026

test('birth date: empty is not an error yet', () => {
  expect(birthDateError('', today)).toBeNull();
});

test('birth date: rejects under-18 the day before the 18th birthday, accepts on it', () => {
  expect(birthDateError('2008-11-20', today)).toMatch(/at least 18/);
  expect(birthDateError('2008-11-19', today)).toBeNull();
});

test('birth date: rejects future, impossible and over-120 dates', () => {
  expect(birthDateError('2027-01-01', today)).toMatch(/past/);
  expect(birthDateError('2001-02-30', today)).toMatch(/valid date/);
  expect(birthDateError('1900-01-01', today)).toMatch(/120/);
});

test('tags: asks for the missing count until three are picked', () => {
  expect(tagsError([1])).toBe('Pick 2 more interests');
  expect(tagsError([1, 2])).toBe('Pick 1 more interest');
  expect(tagsError([1, 2, 3])).toBeNull();
});

test('account fields mirror the server rules', () => {
  expect(emailError('a@b')).not.toBeNull();
  expect(emailError('a@b.co')).toBeNull();
  expect(usernameError('ab')).not.toBeNull();
  expect(usernameError('good_name')).toBeNull();
  expect(nameError('   ')).toBe('Required');
  expect(nameError('x'.repeat(51))).toMatch(/50/);
  expect(passwordError('short')).toMatch(/8/);
  expect(passwordError('aaaaaaaa')).toMatch(/uppercase/);
  expect(passwordError('AAAAAAAA')).toMatch(/lowercase/);
  expect(passwordError('Aaaaaaaa')).toMatch(/special/);
  expect(passwordError('Matcha!Tea42')).toBeNull();
  expect(confirmError('abcdefgh', 'abcdefgx')).toMatch(/match/);
  expect(confirmError('abcdefgh', 'abcdefgh')).toBeNull();
});

test('filters: empty means no bound, out-of-range and inverted ranges are flagged', () => {
  expect(filterErrors({ minAge: '', maxAge: '', maxDistance: '', minFame: '', maxFame: '' })).toEqual({});
  expect(filterErrors({ minAge: '16' }).minAge).toMatch(/18/);
  expect(filterErrors({ minAge: '25.5' }).minAge).toMatch(/Whole/);
  expect(filterErrors({ minAge: '30', maxAge: '25' }).maxAge).toMatch(/min age/);
  expect(filterErrors({ maxDistance: '0' }).maxDistance).toMatch(/More than 0/);
  expect(filterErrors({ maxFame: '500' }).maxFame).toMatch(/100/);
  expect(filterErrors({ minFame: '60', maxFame: '40' }).maxFame).toMatch(/min fame/);
  expect(filterErrors({ minAge: '20', maxAge: '30', maxDistance: '15', minFame: '0', maxFame: '100' })).toEqual({});
});

test('filters: tag count and total length follow the server limits', () => {
  const names = n => Array.from({ length: n }, (_, i) => `tag${i}`);
  expect(filterErrors({ tags: names(20) }).tags).toBeUndefined();
  expect(filterErrors({ tags: names(21) }).tags).toMatch(/at most 20/);
  expect(filterErrors({ tags: ['x'.repeat(600), 'y'.repeat(600)] }).tags).toMatch(/Too many/);
});

test('isoYearsAgo gives a date input value', () => {
  expect(isoYearsAgo(18, today)).toBe('2008-11-19');
});
