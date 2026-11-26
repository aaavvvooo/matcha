import { act, fireEvent, render, screen } from '@testing-library/react';
import BlockedUsersPage from './BlockedUsersPage';
import LikedByPage from './LikedByPage';
import ProfileViewersPage from './ProfileViewersPage';
import { getBlockedUsers, getLikes, getViews, unblockUser } from '../../api/usersApi';

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>, useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock('../../api/usersApi', () => ({
  getLikes: jest.fn(), getViews: jest.fn(), getBlockedUsers: jest.fn(), unblockUser: jest.fn(),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));

const ann = { id: 2, first_name: 'Ann', last_name: '', username: 'ann', viewed_at: new Date().toISOString() };

describe.each([
  ['Who liked you', LikedByPage, getLikes, /No one has liked you/],
  ['Who viewed you', ProfileViewersPage, getViews, /No one has viewed/],
  ['Blocked users', BlockedUsersPage, getBlockedUsers, /haven't blocked anyone/],
])('%s', (_, Page, load, empty) => {
  beforeEach(() => load.mockReset());

  test('a failed load is an error with a retry, never an empty list', async () => {
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([ann]);
    render(<Page />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText(empty)).toBeNull();

    fireEvent.click(retry);
    expect(await screen.findByText('Ann')).toBeInTheDocument();
  });

  test('an empty list says so', async () => {
    load.mockResolvedValue([]);
    render(<Page />);
    expect(await screen.findByText(empty)).toBeInTheDocument();
  });
});

test('a failed unblock is reported and keeps the person in the list', async () => {
  getBlockedUsers.mockReset().mockResolvedValue([ann]);
  unblockUser.mockRejectedValue(new Error('offline'));
  render(<BlockedUsersPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Unblock' }));

  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Unblock' }).pop()); });

  expect(screen.getByRole('alert')).toHaveTextContent('Could not unblock');
  expect(screen.getByText('Ann')).toBeInTheDocument();
});
