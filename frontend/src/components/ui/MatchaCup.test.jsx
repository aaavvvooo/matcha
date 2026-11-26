import { render } from '@testing-library/react';
import MatchaCup from './MatchaCup';

// A shared id resolves to the first cup in the page; when that one is display:none (the desktop
// menu on phones) its gradient does not paint and every other cup loses its green.
test('two identical cups never share gradient ids, and each paints with its own', () => {
  const { container } = render(<><MatchaCup size={24} /><MatchaCup size={24} /></>);
  const [first, second] = [...container.querySelectorAll('svg')].map(svg => ({
    ids: [...svg.querySelectorAll('linearGradient')].map(g => g.id),
    used: [...svg.querySelectorAll('[fill^="url("]')].map(el => el.getAttribute('fill').slice(5, -1)),
  }));

  expect(first.ids.filter(id => second.ids.includes(id))).toEqual([]);
  expect(first.used.every(id => first.ids.includes(id))).toBe(true);
  expect(second.used.every(id => second.ids.includes(id))).toBe(true);
});

const cup = mood => render(<MatchaCup mood={mood} />).container.querySelector('svg');

test.each(['happy', 'shy', 'excited', 'sleepy', 'love', 'match', 'sad', 'searching'])('draws the %s mood', mood => {
  expect(cup(mood)).toHaveAttribute('data-mood', mood);
});

test('every mood has a face of its own', () => {
  const faces = ['happy', 'shy', 'excited', 'sleepy', 'love', 'match', 'sad', 'searching']
    .map(mood => cup(mood).innerHTML.replace(/cup(Body|Lid)[\w-]+/g, ''));
  expect(new Set(faces).size).toBe(faces.length);
});

test('is decoration: hidden from screen readers', () => {
  expect(cup('happy')).toHaveAttribute('aria-hidden', 'true');
});
