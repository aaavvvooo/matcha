import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SearchPage from './SearchPage';
import { search } from '../../api/profilesApi';

jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock('../../api/profilesApi', () => ({ search: jest.fn(), getAllTags: () => Promise.resolve([]) }));
jest.mock('../../api/errors', () => ({ apiError: (_, fallback) => fallback }));

const PAGE = Array.from({ length: 50 }, (_, i) => ({ user_id: i + 1, first_name: `P${i}`, last_name: '', username: `p${i}`, tags: [], photos: [] }));

test('"Load more" continues the results on screen, not the filters being edited', async () => {
  window.matchMedia = () => ({ matches: false });
  search.mockResolvedValue(PAGE);
  render(<SearchPage />);
  fireEvent.click(screen.getByRole('button', { name: '30s' }));
  fireEvent.click(screen.getByRole('button', { name: 'Search →' }));
  await screen.findByText('P0');

  fireEvent.click(screen.getByRole('button', { name: '50s' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

  await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ min_age: 30, max_age: 39, offset: 50 }));
});

test('a new search uses the edited filters', async () => {
  window.matchMedia = () => ({ matches: false });
  search.mockReset().mockResolvedValue(PAGE);
  render(<SearchPage />);
  fireEvent.click(screen.getByRole('button', { name: '50s' }));
  fireEvent.click(screen.getByRole('button', { name: 'Search →' }));

  await waitFor(() => expect(search).toHaveBeenCalledWith(expect.objectContaining({ min_age: 50, max_age: 59, offset: 0 })));
});
