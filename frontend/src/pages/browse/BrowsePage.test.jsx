import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BrowsePageAlone from './BrowsePage';
import { HeaderProvider, usePageHeaderConfig } from '../../context/HeaderContext';
import { browse } from '../../api/profilesApi';
import { likeUser } from '../../api/usersApi';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../api/profilesApi', () => ({ browse: jest.fn(), getAllTags: jest.fn() }));
jest.mock('../../api/usersApi', () => ({ likeUser: jest.fn() }));
jest.mock('../../api/errors', () => ({ apiError: (_, fallback) => fallback }));
let mockUserId = 1;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));

// The sort and filter chips are rendered by the site header.
const HeaderTools = () => usePageHeaderConfig()?.tools ?? null;
const BrowsePage = () => <HeaderProvider><HeaderTools /><BrowsePageAlone /></HeaderProvider>;

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
  mockUserId += 1; // Discover remembers its place per user: every test starts as someone new
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

  fireEvent.click([...panel.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'distance'));

  await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'distance' })));
  expect(document.getElementById('browse-filters')).toBeNull();
});

test('picking a sort keeps the panel open while a filter edit is pending', async () => {
  await renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'filters' }));
  fireEvent.change(screen.getByLabelText('Min age'), { target: { value: '30' } });
  const panel = document.getElementById('browse-filters');

  fireEvent.click([...panel.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'fame'));

  await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'fame' })));
  expect(screen.getByLabelText('Min age')).toHaveValue('30');
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

test('the phone filter button opens and closes the panel and reports active filters', async () => {
  await renderCard();

  fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
  expect(document.getElementById('browse-filters')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Hide filters' })).toHaveAttribute('aria-expanded', 'true');

  fireEvent.change(screen.getByLabelText('Min age'), { target: { value: '30' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });

  expect(document.getElementById('browse-filters')).toBeNull();
  expect(screen.getByRole('button', { name: 'Show filters, 1 active' })).toHaveAttribute('aria-expanded', 'false');
});

describe('coming back to Discover', () => {
  const button = (card, name) => [...card.querySelectorAll('button')].find(b => b.textContent.startsWith(name));

  async function passAnnAndLeave() {
    const { unmount } = render(<BrowsePage />);
    const card = await screen.findByTestId('browse-card');
    fireEvent.click(button(card, 'Pass'));
    await waitFor(() => expect(screen.getByTestId('browse-card')).toHaveTextContent('Bob'));
    unmount();
  }

  test('shows the profile you left on, even when its rank changed, and not the passed ones', async () => {
    await passAnnAndLeave();
    browse.mockResolvedValue([profile(3, 'Cleo'), profile(1, 'Ann'), profile(2, 'Bob')]);

    render(<BrowsePage />);

    expect(await screen.findByTestId('browse-card')).toHaveTextContent('Bob');
    expect(screen.queryByText('Ann')).toBeNull();
    expect(screen.getByText('Cleo')).toBeInTheDocument();
  });

  test('does not bring back someone the server no longer returns (liked, or a block)', async () => {
    await passAnnAndLeave();
    browse.mockResolvedValue([profile(1, 'Ann'), profile(3, 'Cleo')]);

    render(<BrowsePage />);

    expect(await screen.findByTestId('browse-card')).toHaveTextContent('Cleo');
    expect(screen.queryByText('Bob')).toBeNull();
  });

  test('keeps the sort and filters', async () => {
    const { unmount } = render(<BrowsePage />);
    await screen.findByTestId('browse-card');
    fireEvent.click(screen.getByRole('button', { name: 'fame' }));
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'fame' })));
    await screen.findByTestId('browse-card');
    unmount();
    browse.mockClear();

    render(<BrowsePage />);

    await screen.findByTestId('browse-card');
    expect(browse).toHaveBeenCalledWith(expect.objectContaining({ sort_by: 'fame' }));
  });

  test('leaving while a new sort loads does not pin the person from the old order', async () => {
    const { unmount } = render(<BrowsePage />);
    await screen.findByTestId('browse-card');
    browse.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'fame' }));
    unmount();
    browse.mockResolvedValue([profile(3, 'Cleo'), profile(1, 'Ann')]);

    render(<BrowsePage />);

    expect(await screen.findByTestId('browse-card')).toHaveTextContent('Cleo');
  });

  test('leaving while the next page loads keeps everyone you passed', async () => {
    const people = Array.from({ length: 20 }, (_, i) => profile(i + 1, `P${i + 1}`));
    browse.mockResolvedValueOnce(people).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<BrowsePage />);
    for (let i = 0; i < 20; i += 1) {
      const card = await screen.findByTestId('browse-card');
      await act(async () => { fireEvent.click(button(card, 'Pass')); });
    }
    unmount();
    browse.mockReset().mockResolvedValue([...people, profile(21, 'Newcomer')]);

    render(<BrowsePage />);

    expect(await screen.findByTestId('browse-card')).toHaveTextContent('Newcomer');
  });

  test('is forgotten when someone else signs in', async () => {
    await passAnnAndLeave();
    mockUserId += 1;

    render(<BrowsePage />);

    expect(await screen.findByTestId('browse-card')).toHaveTextContent('Ann');
  });

  test('a page made only of passed people ends the stack instead of reloading forever', async () => {
    const people = Array.from({ length: 20 }, (_, i) => profile(i + 1, `P${i + 1}`));
    browse.mockResolvedValue(people);
    render(<BrowsePage />);
    for (let i = 0; i < 20; i += 1) {
      const card = await screen.findByTestId('browse-card');
      await act(async () => { fireEvent.click(button(card, 'Pass')); });
    }

    expect(await screen.findByText(/everyone for now/)).toBeInTheDocument();
    expect(browse.mock.calls.length).toBeLessThan(4);
  });
});

test('a like that fails without a server message still tells the user', async () => {
  likeUser.mockRejectedValueOnce(new Error('offline'));
  const card = await renderCard();

  await act(async () => { fireEvent.click([...card.querySelectorAll('button')].find(b => b.textContent.startsWith('Like'))); });

  expect(screen.getByText(/Could not send your like/)).toBeInTheDocument();
});

describe('the cup on Discover', () => {
  const moods = () => [...document.querySelectorAll('svg[data-mood]')].map(svg => svg.getAttribute('data-mood'));
  const likeFirst = async () => {
    const card = await renderCard();
    await act(async () => { fireEvent.click([...card.querySelectorAll('button')].find(b => b.textContent.startsWith('Like'))); });
  };

  test('is searching while people load', () => {
    browse.mockReturnValue(new Promise(() => {}));
    render(<BrowsePage />);
    expect(moods()).toEqual(['searching']);
  });

  test('pops with love after a like, then leaves', async () => {
    await likeFirst();
    expect(moods()).toContain('love');
    await waitFor(() => expect(moods()).not.toContain('love'), { timeout: 2500 });
  });

  test('celebrates a match with hearts instead', async () => {
    likeUser.mockResolvedValue({ is_match: true });
    await likeFirst();
    expect(moods()).toContain('match');
    expect(moods()).not.toContain('love');
  });

  test('stays away when the like fails', async () => {
    likeUser.mockRejectedValue(new Error('offline'));
    await likeFirst();
    expect(moods()).not.toContain('love');
  });

  test('is sad when people cannot be loaded', async () => {
    browse.mockRejectedValue(new Error('offline'));
    render(<BrowsePage />);
    await screen.findByRole('button', { name: 'Try again' });
    expect(moods()).toEqual(['sad']);
  });
});
