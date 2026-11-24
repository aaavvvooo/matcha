import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BrowsePage from './BrowsePage';
import { browse } from '../../api/profilesApi';
import { likeUser } from '../../api/usersApi';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../api/profilesApi', () => ({ browse: jest.fn(), getAllTags: jest.fn() }));
jest.mock('../../api/usersApi', () => ({ likeUser: jest.fn() }));
jest.mock('../../api/errors', () => ({ apiError: (_, fallback) => fallback }));
jest.mock('../../context/NotificationContext', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));

const profile = (id, name) => ({ user_id: id, first_name: name, last_name: '', username: name, tags: [], photos: [] });

// jsdom has no PointerEvent, so coordinates are attached by hand.
function pointer(type, el, x = 0, y = 0) {
  const event = createEvent[type](el);
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  fireEvent(el, event);
}

async function renderCard() {
  render(<BrowsePage />);
  return screen.findByTestId('browse-card');
}

beforeEach(() => {
  browse.mockReset().mockResolvedValue([profile(1, 'Ann'), profile(2, 'Bob'), profile(3, 'Cleo')]);
  require('../../api/profilesApi').getAllTags.mockReset().mockResolvedValue([]);
  likeUser.mockReset().mockResolvedValue({ is_match: false });
});

test('a swipe to the right likes the profile exactly once', async () => {
  const card = await renderCard();

  pointer('pointerDown', card, 100);
  pointer('pointerMove', card, 220);
  pointer('pointerUp', card, 220);
  pointer('pointerOut', card, 220); // touch: leave always follows up

  await waitFor(() => expect(likeUser).toHaveBeenCalledWith(1));
  await act(async () => {});
  expect(likeUser).toHaveBeenCalledTimes(1);
});

test('a touch the browser takes over for scrolling never likes and puts the card back', async () => {
  const card = await renderCard();

  pointer('pointerDown', card, 100);
  pointer('pointerMove', card, 220);
  pointer('pointerCancel', card, 220);
  pointer('pointerOut', card, 220);

  await act(async () => {});
  expect(likeUser).not.toHaveBeenCalled();
  expect(card.style.transform).toContain('translateX(0px)');
});

test('the filter panel offers sorting; picking one closes it when no filter edit is pending', async () => {
  await renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'filters' }));
  const panel = document.getElementById('browse-filters');

  fireEvent.click([...panel.querySelectorAll('button')].find(b => b.textContent === 'distance'));

  await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'distance' })));
  expect(document.getElementById('browse-filters')).toBeNull();
});

test('picking a sort keeps the panel open while a filter edit is pending', async () => {
  await renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'filters' }));
  fireEvent.change(screen.getByLabelText('Min age'), { target: { value: '30' } });
  const panel = document.getElementById('browse-filters');

  fireEvent.click([...panel.querySelectorAll('button')].find(b => b.textContent === 'fame'));

  await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'fame' })));
  expect(screen.getByLabelText('Min age')).toHaveValue(30);
});

test('tapping Like or Pass again while a like is being sent does nothing', async () => {
  let finishLike;
  likeUser.mockImplementation(() => new Promise(resolve => { finishLike = resolve; }));
  const card = await renderCard();
  const [like, pass] = ['Like', 'Pass'].map(name => [...card.querySelectorAll('button')].find(b => b.textContent.startsWith(name)));

  fireEvent.click(like);
  fireEvent.click(like);
  fireEvent.click(pass);

  expect(likeUser).toHaveBeenCalledTimes(1);
  expect(card).toHaveTextContent('Ann');
  await act(async () => finishLike({ is_match: false }));
  expect(screen.getByTestId('browse-card')).toHaveTextContent('Bob');
});

test('Like works again after a failed like', async () => {
  likeUser.mockRejectedValueOnce(new Error('offline'));
  const card = await renderCard();
  const like = [...card.querySelectorAll('button')].find(b => b.textContent.startsWith('Like'));

  await act(async () => { fireEvent.click(like); });
  await act(async () => { fireEvent.click(like); });

  expect(likeUser).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('browse-card')).toHaveTextContent('Bob');
});

test('a swipe whose like fails puts the card back', async () => {
  likeUser.mockRejectedValueOnce(new Error('offline'));
  const card = await renderCard();

  pointer('pointerDown', card, 100);
  pointer('pointerMove', card, 220);
  await act(async () => { pointer('pointerUp', card, 220); });

  expect(card).toHaveTextContent('Ann');
  expect(card.style.transform).toContain('translateX(0px)');
});
